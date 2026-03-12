import { AgentMemory } from "./memory.js";
import { planNextAction } from "./planner.js";
import { executeTool } from "./actionResolver.js";
import { summarizeRun } from "./responder.js";
import { inferGoalType } from "./inferGoalType.js";
import { indexWorkspaceFiles, removeFileFromIndex } from "../rag/indexer.js";
import type { ToolName } from "./memory.js";
import type { GoalType, RunMode } from "../api/schema.js";
import type { ConversationMessage } from "../api/schema.js";

const MAX_HISTORY_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 1500;

function formatConversationHistory(history: ConversationMessage[] | undefined): string {
  if (!history?.length) return "";
  const slice = history.slice(-MAX_HISTORY_MESSAGES);
  return slice
    .map((m) => {
      const label = m.role === "user" ? "User" : "Assistant";
      const text = String(m.content ?? "").slice(0, MAX_MESSAGE_LENGTH);
      return label + ": " + text + (String(m.content).length > MAX_MESSAGE_LENGTH ? "…" : "");
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
  history?: ConversationMessage[];
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
  const memory = new AgentMemory(task);
  const trace: TraceEntry[] = [];
  const dryRunPlannedChanges: Array<{ tool: string; params: unknown }> = [];

  const goalType: GoalType =
    options?.goalType ?? (await inferGoalType(task));
  const conversationHistory = formatConversationHistory(options?.history);

  let steps = 0;
  const observationSummaries: string[] = [];
  const relevantContextChunks: string[] = [];
  const MAX_CONTEXT_CHUNKS = 3;

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error(`Task timeout after ${timeoutMs}ms`)), timeoutMs);
    t.unref?.();
  });

  async function runLoop(): Promise<AgentRunResult> {
  while (steps < maxSteps) {
    const recentObservations = formatRecentObservations(observationSummaries);

    const relevantContext = relevantContextChunks.slice(-MAX_CONTEXT_CHUNKS).join("\n\n---\n\n");

    const planned = await planNextAction({
      task,
      recentObservations,
      relevantContext,
      goalType,
      mode,
      conversationHistory,
    });

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
      if (dryRun && typeof result === "object" && result !== null && "dryRun" in result && (result as { dryRun: boolean }).dryRun) {
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
        results?: Array<{ filePath?: string; content?: string; symbol?: string }>;
      };
      const results = searchResult.results ?? [];
      const chunk = results
        .slice(0, 8)
        .map((r) => {
          const header = r.symbol
            ? `[${r.filePath ?? "?"}] symbol: ${r.symbol}\n`
            : `[${r.filePath ?? "?"}]\n`;
          return header + String(r.content ?? "").slice(0, 500);
        })
        .join("\n\n");
      relevantContextChunks.push(chunk);
      if (relevantContextChunks.length > MAX_CONTEXT_CHUNKS) {
        relevantContextChunks.shift();
      }
    }

    observationSummaries.push(
      `Tool: ${tool}\nInput: ${JSON.stringify(params)}\nOutput: ${outStr.slice(0, 2000)}`,
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
    ...((mode === "Plan" || (dryRun && dryRunPlannedChanges.length > 0)) && dryRunPlannedChanges.length > 0
      ? { dryRunPlannedChanges }
      : {}),
  };
  }

  return Promise.race([runLoop(), timeoutPromise]);
}

const TRACE_OUTPUT_MAX = 600;

function truncateForTrace(output: unknown): string {
  const s = typeof output === "string" ? output : JSON.stringify(output);
  return s.length <= TRACE_OUTPUT_MAX ? s : s.slice(0, TRACE_OUTPUT_MAX) + "...";
}

function triggerAutoIndex(tool: string, params: unknown, result?: unknown): void {
  const p = params as Record<string, unknown>;
  const path = typeof p?.path === "string" ? p.path : "";
  const paths = Array.isArray(p?.paths) ? (p.paths as string[]) : [];
  const from = typeof p?.from === "string" ? p.from : "";
  const to = typeof p?.to === "string" ? p.to : "";
  const res = result as Record<string, unknown> | undefined;
  const deletedFiles = Array.isArray(res?.deletedFiles) ? (res.deletedFiles as string[]) : [];

  void (async () => {
    try {
      if (tool === "writeFile" || tool === "editLines") {
        if (path) await indexWorkspaceFiles([path]);
      } else if (tool === "deleteFile") {
        if (path) await removeFileFromIndex(path);
      } else if (tool === "deleteFiles") {
        for (const f of paths) if (f) await removeFileFromIndex(f);
      } else if (tool === "deleteFolder" || tool === "deletePath") {
        const files = tool === "deletePath" && res?.type === "file"
          ? [path]
          : deletedFiles;
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

const OBSERVATIONS_TAIL = 3;
const OBSERVATIONS_SUMMARY_IF_OVER = 5;

function formatRecentObservations(summaries: string[]): string {
  if (summaries.length <= OBSERVATIONS_SUMMARY_IF_OVER) {
    return summaries.slice(-5).join("\n---\n");
  }
  const tail = summaries.slice(-OBSERVATIONS_TAIL).join("\n---\n");
  const toolNames = summaries
    .slice(0, -OBSERVATIONS_TAIL)
    .map((s) => {
      const m = s.match(/Tool:\s*(\w+)/);
      return m ? m[1] : "?";
    })
    .join(", ");
  return `Earlier steps (${summaries.length - OBSERVATIONS_TAIL}): ${toolNames}\n---\n${tail}`;
}

