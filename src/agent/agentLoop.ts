import { AgentMemory } from "./memory.js";
import { planNextAction } from "./planner.js";
import { executeTool } from "./actionResolver.js";
import { summarizeRun } from "./responder.js";
import type { ToolName } from "./memory.js";
import type { GoalType } from "../api/schema.js";

export interface AgentRunOptions {
  maxSteps?: number;
  goalType?: GoalType;
}

export interface AgentRunResult {
  finished: boolean;
  steps: number;
  memory: ReturnType<AgentMemory["snapshot"]>;
  answer: string | null;
}

export async function runAgentLoop(
  task: string,
  options?: AgentRunOptions,
): Promise<AgentRunResult> {
  const maxSteps = options?.maxSteps ?? 8;
  const memory = new AgentMemory(task);

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

    const result = await executeTool(tool as ToolName, params);

    memory.recordObservation({
      tool,
      input: params,
      output: result,
    });

    const outStr = JSON.stringify(result);
    if (tool === "searchCode" && typeof result === "object" && result !== null) {
      const searchResult = result as { results?: Array<{ filePath?: string; content?: string }> };
      const results = searchResult.results ?? [];
      relevantContext = results
        .slice(0, 8)
        .map(
          (r) =>
            `[${r.filePath ?? "?"}]\n${String(r.content ?? "").slice(0, 500)}`,
        )
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
  };
}

