import { AgentMemory } from "./memory.js";
import { planNextAction } from "./planner.js";
import { executeTool } from "./actionResolver.js";
import { summarizeRun } from "./responder.js";
import { inferGoalType } from "./inferGoalType.js";
import { indexWorkspaceFiles, removeFileFromIndex } from "../rag/indexer.js";
import { searchCodeTool } from "../tools/searchTools.js";
import { AGENT_CONFIG } from "../config/agent.js";
import type { ToolName } from "./memory.js";
import type { GoalType, RunMode } from "../api/schema.js";
import type { ConversationMessage } from "../api/schema.js";

const MAX_HISTORY_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 1500;

function formatConversationHistory(
  history: ConversationMessage[] | undefined,
): string {
  if (!history?.length) return "";
  const slice = history.slice(-MAX_HISTORY_MESSAGES);
  return slice
    .map((m) => {
      const label = m.role === "user" ? "User" : "Assistant";
      const text = String(m.content ?? "").slice(0, MAX_MESSAGE_LENGTH);
      return (
        label +
        ": " +
        text +
        (String(m.content).length > MAX_MESSAGE_LENGTH ? "…" : "")
      );
    })
    .join("\n\n");
}

export interface StepEvent {
  step: number;
  tool: string;
  params: unknown;
  result?: unknown;
  error?: string;
}

export interface AgentRunOptions {
  maxSteps?: number;
  goalType?: GoalType;
  mode?: RunMode;
  verbose?: boolean;
  dryRun?: boolean;
  timeoutMs?: number;
  onStep?: (event: StepEvent) => void;
  /** Called with each planner LLM stream delta when using streaming (e.g. for /tasks/stream) */
  onPlannerChunk?: (delta: string) => void;
  history?: ConversationMessage[];
  /** When aborted, the loop returns early with cancelled: true */
  signal?: AbortSignal;
}

export interface TraceEntry {
  timestamp: string;
  tool: string;
  params?: unknown;
  error?: string;
  outputTruncated?: string;
}

export interface AgentRunResult {
  finished: boolean;
  steps: number;
  memory: ReturnType<AgentMemory["snapshot"]>;
  answer: string | null;
  trace?: TraceEntry[];
  dryRunPlannedChanges?: Array<{ tool: string; params: unknown }>;
  /** True when the run was aborted via signal */
  cancelled?: boolean;
}

export async function runAgentLoop(
  task: string,
  options?: AgentRunOptions,
): Promise<AgentRunResult> {
  const maxSteps = options?.maxSteps ?? 8;
  const mode = options?.mode ?? "Agent";
  const verbose = options?.verbose ?? false;
  const dryRun = options?.dryRun ?? false;
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
  const onStep = options?.onStep;
  const signal = options?.signal;
  const memory = new AgentMemory(task);
  const trace: TraceEntry[] = [];
  const dryRunPlannedChanges: Array<{ tool: string; params: unknown }> = [];

  const conversationHistory = formatConversationHistory(options?.history);

  const cfg = AGENT_CONFIG;
  const [goalType, initialRagChunk] = await Promise.all([
    options?.goalType ?? inferGoalType(task),
    (async (): Promise<string | null> => {
      try {
        const initialQuery = task.slice(0, cfg.initialRagQueryMaxChars);
        const initialSearch = await searchCodeTool(initialQuery);
        const results = initialSearch.results ?? [];
        if (results.length === 0) return null;
        return results
          .slice(0, cfg.initialRagMaxResults)
          .map((r) => formatSearchChunk(r, cfg.initialRagSnippetChars))
          .join("\n\n");
      } catch {
        return null;
      }
    })(),
  ]);

  let steps = 0;
  const observationSummaries: string[] = [];
  const relevantContextChunks: string[] = initialRagChunk
    ? [initialRagChunk]
    : [];

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Task timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
    t.unref?.();
  });

  async function runLoop(): Promise<AgentRunResult> {
    while (steps < maxSteps) {
      if (signal?.aborted) {
        return {
          finished: false,
          steps,
          memory: memory.snapshot(),
          answer: null,
          cancelled: true,
        };
      }
      const recentObservations = formatRecentObservations(observationSummaries);
      const alreadyReadPaths = getAlreadyReadPaths(observationSummaries);
      const alreadyListedPaths = getAlreadyListedPaths(observationSummaries);

      const relevantContext = relevantContextChunks
        .slice(-cfg.maxContextChunks)
        .join("\n\n---\n\n");

      if (verbose) {
        console.debug(
          "[planner] step",
          steps + 1,
          "| alreadyReadPaths:",
          alreadyReadPaths || "(none)",
          "| alreadyListedPaths:",
          alreadyListedPaths || "(none)",
          "| recentObservations length:",
          recentObservations.length,
        );
      }
      const planned = await planNextAction({
        task,
        recentObservations,
        relevantContext,
        goalType,
        mode,
        conversationHistory,
        alreadyReadPaths:
          alreadyReadPaths.length > 0 ? alreadyReadPaths : undefined,
        alreadyListedPaths:
          alreadyListedPaths.length > 0 ? alreadyListedPaths : undefined,
        stepsRemaining: maxSteps - steps,
        maxSteps,
        onPlannerChunk: options?.onPlannerChunk,
      });

      if (signal?.aborted) {
        return {
          finished: false,
          steps,
          memory: memory.snapshot(),
          answer: null,
          cancelled: true,
        };
      }
      if (!planned) {
        break;
      }

      const { tool, params } = planned;

      if (mode === "Plan") {
        dryRunPlannedChanges.push({ tool, params });
        memory.recordObservation({
          tool,
          input: params,
          output: { planned: true, message: "Not executed (Plan mode)" },
        });
        observationSummaries.push(
          `Tool: ${tool}\nInput: ${JSON.stringify(params)}\nOutput: (planned, not executed)`,
        );
        steps += 1;
        onStep?.({ step: steps, tool, params, result: { planned: true } });
        continue;
      }

      let result: unknown;
      try {
        result = await executeTool(tool as ToolName, params, { dryRun, mode });
        if (
          dryRun &&
          typeof result === "object" &&
          result !== null &&
          "dryRun" in result &&
          (result as { dryRun: boolean }).dryRun
        ) {
          const r = result as { planned?: { tool: string; params: unknown } };
          if (r.planned) dryRunPlannedChanges.push(r.planned);
        }
        if (verbose) {
          trace.push({
            timestamp: new Date().toISOString(),
            tool,
            params,
            outputTruncated: truncateForTrace(result),
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (verbose) {
          trace.push({
            timestamp: new Date().toISOString(),
            tool,
            params,
            error: errorMessage,
          });
        }
        memory.recordObservation({
          tool,
          input: params,
          output: { error: errorMessage },
        });
        observationSummaries.push(
          `Tool: ${tool}\nInput: ${JSON.stringify(params)}\nError: ${errorMessage}`,
        );
        steps += 1;
        onStep?.({ step: steps, tool, params, error: errorMessage });
        continue;
      }

      memory.recordObservation({
        tool,
        input: params,
        output: result,
      });

      const outStr = JSON.stringify(result);
      if (
        (tool === "searchCode" || tool === "searchSymbols") &&
        typeof result === "object" &&
        result !== null
      ) {
        const searchResult = result as {
          results?: Array<{
            filePath?: string;
            content?: string;
            symbol?: string;
          }>;
        };
        const results = searchResult.results ?? [];
        const chunk = results
          .slice(0, cfg.searchChunkMaxResults)
          .map((r) => formatSearchChunk(r, cfg.searchChunkSnippetChars))
          .join("\n\n");
        relevantContextChunks.push(chunk);
        if (relevantContextChunks.length > cfg.maxContextChunks) {
          relevantContextChunks.shift();
        }
      }

      observationSummaries.push(
        `Tool: ${tool}\nInput: ${JSON.stringify(params)}\nOutput: ${outStr.slice(0, cfg.observationOutputMaxChars)}`,
      );
      steps += 1;
      onStep?.({ step: steps, tool, params, result: truncateForTrace(result) });

      if (!dryRun && mode === "Agent") {
        triggerAutoIndex(tool, params, result);
      }
    }

    const snapshot = memory.snapshot();
    let answer: string | null = null;
    try {
      answer = await summarizeRun(task, snapshot);
    } catch {
      answer = null;
    }

    return {
      finished: true,
      steps,
      memory: snapshot,
      answer,
      ...(verbose && trace.length > 0 ? { trace } : {}),
      ...((mode === "Plan" || (dryRun && dryRunPlannedChanges.length > 0)) &&
      dryRunPlannedChanges.length > 0
        ? { dryRunPlannedChanges }
        : {}),
    };
  }

  return Promise.race([runLoop(), timeoutPromise]);
}

const TRACE_OUTPUT_MAX = 600;

function truncateForTrace(output: unknown): string {
  const s = typeof output === "string" ? output : JSON.stringify(output);
  return s.length <= TRACE_OUTPUT_MAX
    ? s
    : s.slice(0, TRACE_OUTPUT_MAX) + "...";
}

function triggerAutoIndex(
  tool: string,
  params: unknown,
  result?: unknown,
): void {
  const p = params as Record<string, unknown>;
  const path = typeof p?.path === "string" ? p.path : "";
  const paths = Array.isArray(p?.paths) ? (p.paths as string[]) : [];
  const from = typeof p?.from === "string" ? p.from : "";
  const to = typeof p?.to === "string" ? p.to : "";
  const res = result as Record<string, unknown> | undefined;
  const deletedFiles = Array.isArray(res?.deletedFiles)
    ? (res.deletedFiles as string[])
    : [];

  void (async () => {
    try {
      if (tool === "writeFile" || tool === "editLines" || tool === "searchReplace" || tool === "appendFile") {
        if (path) await indexWorkspaceFiles([path]);
      } else if (tool === "deleteFile") {
        if (path) await removeFileFromIndex(path);
      } else if (tool === "deleteFiles") {
        for (const f of paths) if (f) await removeFileFromIndex(f);
      } else if (tool === "deleteFolder" || tool === "deletePath") {
        const files =
          tool === "deletePath" && res?.type === "file" ? [path] : deletedFiles;
        for (const f of files) if (f) await removeFileFromIndex(f);
      } else if (tool === "moveFile") {
        if (from) await removeFileFromIndex(from);
        if (to) await indexWorkspaceFiles([to]);
      } else if (tool === "copyFile") {
        if (to) await indexWorkspaceFiles([to]);
      }
    } catch {
      // ignore index errors so the agent loop is not affected
    }
  })();
}

function formatSearchChunk(
  r: {
    filePath?: string;
    symbol?: string;
    startLine?: number;
    endLine?: number;
    content?: string;
  },
  maxContentChars: number,
): string {
  const path = r.filePath ?? "?";
  const lineRange =
    typeof r.startLine === "number" && typeof r.endLine === "number"
      ? ` lines ${r.startLine}-${r.endLine}`
      : typeof r.startLine === "number"
        ? ` line ${r.startLine}`
        : "";
  const symbolPart = r.symbol ? ` symbol: ${r.symbol}` : "";
  const header = `[${path}]${lineRange}${symbolPart}\n`;
  return header + String(r.content ?? "").slice(0, maxContentChars);
}

function getAlreadyReadPaths(summaries: string[]): string {
  const paths: string[] = [];
  for (const s of summaries) {
    if (!s.includes("Tool: readFile")) continue;
    const m = s.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) paths.push(m[1]);
  }
  return [...new Set(paths)].join(", ");
}

function getAlreadyListedPaths(summaries: string[]): string {
  const paths: string[] = [];
  for (const s of summaries) {
    if (!s.includes("Tool: listFiles")) continue;
    const m = s.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) paths.push(m[1]);
  }
  return [...new Set(paths)].join(", ");
}

function formatRecentObservations(summaries: string[]): string {
  const cfg = AGENT_CONFIG;
  if (summaries.length <= cfg.observationsSummaryThreshold) {
    return summaries.slice(-5).join("\n---\n");
  }
  const tail = summaries.slice(-cfg.observationsTailCount).join("\n---\n");
  const toolNames = summaries
    .slice(0, -cfg.observationsTailCount)
    .map((s) => {
      const m = s.match(/Tool:\s*(\w+)/);
      return m ? m[1] : "?";
    })
    .join(", ");
  return `Earlier steps (${summaries.length - cfg.observationsTailCount}): ${toolNames}\n---\n${tail}`;
}
