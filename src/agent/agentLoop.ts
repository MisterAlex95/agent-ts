import { AgentMemory } from "./memory.js";
import { planNextAction } from "./planner.js";
import { executeTool } from "./actionResolver.js";
import { summarizeRun } from "./responder.js";
import type { ToolName } from "./memory.js";
import type { GoalType } from "../api/schema.js";

export interface AgentRunOptions {
  maxSteps?: number;
  goalType?: GoalType;
  verbose?: boolean;
}

export interface TraceEntry {
  timestamp: string;
  tool: string;
  params?: unknown;
  error?: string;
}

export interface AgentRunResult {
  finished: boolean;
  steps: number;
  memory: ReturnType<AgentMemory["snapshot"]>;
  answer: string | null;
  trace?: TraceEntry[];
}

export async function runAgentLoop(
  task: string,
  options?: AgentRunOptions,
): Promise<AgentRunResult> {
  const maxSteps = options?.maxSteps ?? 8;
  const verbose = options?.verbose ?? false;
  const memory = new AgentMemory(task);
  const trace: TraceEntry[] = [];

  let steps = 0;
  const observationSummaries: string[] = [];
  let relevantContext = "";

  while (steps < maxSteps) {
    const recentObservations = observationSummaries.slice(-5).join("\n---\n");

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
      result = await executeTool(tool as ToolName, params);
      if (verbose) {
        trace.push({
          timestamp: new Date().toISOString(),
          tool,
          params,
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
      relevantContext = results
        .slice(0, 8)
        .map((r) => {
          const header = r.symbol
            ? `[${r.filePath ?? "?"}] symbol: ${r.symbol}\n`
            : `[${r.filePath ?? "?"}]\n`;
          return header + String(r.content ?? "").slice(0, 500);
        })
        .join("\n\n");
    }

    observationSummaries.push(
      `Tool: ${tool}\nInput: ${JSON.stringify(params)}\nOutput: ${outStr.slice(0, 2000)}`,
    );
    steps += 1;
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
  };
}

