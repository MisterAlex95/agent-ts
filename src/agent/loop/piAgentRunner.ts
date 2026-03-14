/**
 * Optional agent loop using @mariozechner/pi-agent-core.
 * Use when AGENT_USE_PI_AGENT=1 to run with native tool calling and event-driven SSE.
 * Maps agent.subscribe() events to the same callbacks as runAgentLoop (onPlannerChunk, onStep, onAnswerChunk).
 */
import { Agent } from "@mariozechner/pi-agent-core";
import { getPiModel } from "../../llm/piAiProvider.js";
import { getPiTools, executePiToolCall } from "../../tools/piAiTools.js";
import { READ_ONLY_TOOLS } from "../planning/planner.js";
import { loadProjectRules } from "../rules/loadProjectRules.js";
import { searchCodeTool } from "../../tools/search/index.js";
import { formatSearchChunk } from "./formatObservations.js";
import { AGENT_CONFIG } from "../../config/agent.js";
import type { AgentRunOptions, AgentRunResult } from "./types.js";
import type { RunMode } from "../../api/schema.js";
import type { AgentTool } from "@mariozechner/pi-agent-core";

function buildAgentTools(mode: RunMode, dryRun: boolean, workspaceSubpath?: string): AgentTool[] {
  const tools = getPiTools(mode);
  return tools.map((t) => ({
    ...t,
    label: t.name,
    execute: async (
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal?: AbortSignal,
      _onUpdate?: (partial: { content: Array<{ type: "text"; text: string }>; details: unknown }) => void,
    ) => {
      const result = await executePiToolCall(t.name, params, {
        mode,
        dryRun,
        workspaceSubpath,
      });
      const text =
        typeof result === "string"
          ? result
          : JSON.stringify(result);
      return {
        content: [{ type: "text" as const, text }],
        details: result,
      };
    },
  })) as AgentTool[];
}

/**
 * Run the agent using pi-agent-core. Uses getPiModel() so AGENT_LLM_PROVIDER=pi and
 * OpenAI-compatible base URL (Ollama/vLLM) are required for this path.
 */
export async function runAgentLoopWithPiAgent(
  task: string,
  options?: AgentRunOptions,
): Promise<AgentRunResult> {
  const mode = options?.mode ?? "Agent";
  const dryRun = options?.dryRun ?? false;
  const _maxSteps = options?.maxSteps ?? 8;
  const onPlannerChunk = options?.onPlannerChunk;
  const onStep = options?.onStep;
  const onAnswerChunk = options?.onAnswerChunk;
  const signal = options?.signal;
  const workspaceSubpath = options?.workspaceSubpath?.trim();
  const focusPaths = options?.focusPaths?.length
    ? options.focusPaths.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, ""))
    : workspaceSubpath ? [workspaceSubpath + "/"] : undefined;

  const [projectRules, initialRagChunk] = await Promise.all([
    loadProjectRules(),
    (async () => {
      try {
        const query = task.slice(0, AGENT_CONFIG.initialRagQueryMaxChars);
        const search = await searchCodeTool(query);
        let results = (search.results ?? []).slice(0, AGENT_CONFIG.initialRagMaxResults);
        if (focusPaths?.length && results.length > 0) {
          results = results.filter((r) => {
            const fp = (r.filePath ?? "").replace(/\\/g, "/");
            return focusPaths.some((focus) => fp === focus || fp.startsWith(focus) || fp.startsWith(focus.replace(/\/$/, "") + "/"));
          });
        }
        if (results.length === 0) return null;
        return results
          .map((r) => formatSearchChunk(r, AGENT_CONFIG.initialRagSnippetChars))
          .join("\n\n");
      } catch {
        return null;
      }
    })(),
  ]);

  const systemParts = [
    "You are a coding agent. Use the available tools to accomplish the user's task. When done, reply with a concise summary.",
    workspaceSubpath
      ? `\nYou must only read and modify files under the directory: ${workspaceSubpath}/. All paths you use (path, from, to, cwd) are relative to the workspace root and will be scoped to this directory. Do not reference files outside ${workspaceSubpath}/.`
      : "",
    projectRules ? `\nProject rules:\n${projectRules}` : "",
    initialRagChunk ? `\nRelevant context:\n${initialRagChunk}` : "",
  ].filter(Boolean);

  const agentTools = buildAgentTools(mode, dryRun, workspaceSubpath);
  const model = getPiModel();

  const agent = new Agent({
    initialState: {
      systemPrompt: systemParts.join("\n"),
      model,
      thinkingLevel: "off",
      tools: agentTools,
      messages: [],
    },
    convertToLlm: (messages) =>
      messages.filter((m) =>
        ["user", "assistant", "toolResult"].includes((m as { role: string }).role),
      ),
    beforeToolCall: async ({ toolCall }) => {
      if (mode === "Ask" && !READ_ONLY_TOOLS.includes(toolCall.name as (typeof READ_ONLY_TOOLS)[number])) {
        return { block: true, reason: "Ask mode: read-only tools only." };
      }
      return undefined;
    },
  });

  const steps: Array<{ step: number; tool: string; params: unknown; result?: unknown; error?: string }> = [];
  let stepCount = 0;
  let lastAssistantText = "";
  const toolArgsByCallId = new Map<string, unknown>();

  const unsub = agent.subscribe((event) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent?.type === "text_delta" && event.assistantMessageEvent.delta) {
          onPlannerChunk?.(event.assistantMessageEvent.delta);
        }
        break;
      case "message_end":
        if (event.message.role === "assistant") {
          const textBlocks = event.message.content.filter(
            (c): c is { type: "text"; text: string } => c.type === "text",
          );
          lastAssistantText = textBlocks.map((b) => b.text).join("");
        }
        break;
      case "tool_execution_start":
        stepCount += 1;
        toolArgsByCallId.set(event.toolCallId, event.args);
        break;
      case "tool_execution_end": {
        const args = toolArgsByCallId.get(event.toolCallId);
        toolArgsByCallId.delete(event.toolCallId);
        const resultContent = event.result?.content?.[0];
        const resultText = resultContent && resultContent.type === "text" ? resultContent.text : undefined;
        steps.push({
          step: stepCount,
          tool: event.toolName,
          params: args,
          result: resultText ?? event.result,
          error: event.isError ? (resultText ?? "Tool error") : undefined,
        });
        onStep?.({
          step: stepCount,
          tool: event.toolName,
          params: args,
          result: event.result,
          error: event.isError ? "Tool error" : undefined,
        });
        break;
      }
      default:
        break;
    }
  });

  try {
    await agent.prompt(task);
  } catch (err) {
    if (signal?.aborted) {
      unsub();
      return {
        finished: false,
        steps: stepCount,
        memory: {
          task,
          actions: steps.map((s) => ({
            tool: s.tool as import("../memory/index.js").ToolName,
            input: s.params,
            output: s.result ?? s.error,
            timestamp: new Date().toISOString(),
          })),
        },
        answer: null,
        cancelled: true,
      };
    }
    unsub();
    throw err;
  }

  unsub();

  const answer = lastAssistantText.trim() || null;
  if (answer && onAnswerChunk) {
    onAnswerChunk(answer);
  }

  const memory = {
    task,
    actions: steps.map((s) => ({
      tool: s.tool as import("../memory/index.js").ToolName,
      input: s.params,
      output: s.result ?? (s.error ? { error: s.error } : {}),
      timestamp: new Date().toISOString(),
    })),
  };

  return {
    finished: true,
    steps: stepCount,
    memory,
    answer,
  };
}
