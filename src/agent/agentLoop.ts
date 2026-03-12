import { AgentMemory } from "./memory.js";
import { planNextAction } from "./planner.js";
import { executeTool } from "./actionResolver.js";
import { summarizeRun } from "./responder.js";
import type { ToolName } from "./memory.js";
import type { GoalType } from "../api/schema.js";

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
  verbose?: boolean;
  dryRun?: boolean;
  timeoutMs?: number;
  onStep?: (event: StepEvent) => void;
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
  const verbose = options?.verbose ?? false;
  const dryRun = options?.dryRun ?? false;
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
  const onStep = options?.onStep;
  const memory = new AgentMemory(task);
  const trace: TraceEntry[] = [];
  const dryRunPlannedChanges: Array<{ tool: string; params: unknown }> = [];

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
      goalType: options?.goalType ?? "generic",
    });

    if (!planned) {
      break;
    }

    const { tool, params } = planned;

    let result: unknown;
    try {
      result = await executeTool(tool as ToolName, params, { dryRun });
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
    ...(dryRun && dryRunPlannedChanges.length > 0
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

