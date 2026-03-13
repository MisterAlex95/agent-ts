/**
 * Main agent loop: plan → execute → record until DONE or max steps.
 */
import { AgentMemory } from "../memory/index.js";
import { planNextAction } from "../planning/planner.js";
import { executeTool } from "../execution/actionResolver.js";
import { summarizeRun } from "../responder/index.js";
import { inferGoalType } from "../planning/inferGoalType.js";
import { searchCodeTool } from "../../tools/search/index.js";
import { AGENT_CONFIG } from "../../config/agent.js";
import type { ToolName } from "../memory/index.js";
import type { AgentRunOptions, AgentRunResult, TraceEntry } from "./types.js";
import { formatConversationHistory } from "./formatConversation.js";
import {
  formatSearchChunk,
  formatRecentObservations,
  getAlreadyReadPaths,
  getAlreadyListedPaths,
  getHasPerformedWrite,
  truncateForTrace,
} from "./formatObservations.js";
import { triggerAutoIndex } from "./autoIndex.js";
import { logger } from "../../logger.js";

export class TaskTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskTimeoutError";
  }
}

export type { AgentRunOptions, AgentRunResult, StepEvent, TraceEntry } from "./types.js";

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
      () => reject(new TaskTimeoutError(`Task timeout after ${timeoutMs}ms`)),
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
      const hasPerformedWrite = getHasPerformedWrite(observationSummaries);

      const relevantContext = relevantContextChunks
        .slice(-cfg.maxContextChunks)
        .join("\n\n---\n\n");

      if (verbose) {
        logger.debug(
          "[planner] step",
          {
            step: steps + 1,
            alreadyReadPaths: alreadyReadPaths || "(none)",
            alreadyListedPaths: alreadyListedPaths || "(none)",
            recentObservationsLength: recentObservations.length,
          },
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
        hasPerformedWrite,
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
