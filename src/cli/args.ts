/**
 * Shared CLI types and argument parsing.
 */

export const BASE_URL = process.env.AGENT_API_URL ?? "http://localhost:3000";

export type GoalType = "generic" | "runTestsAndFix" | "addEndpoint" | "improveTypes";
export type RunMode = "Agent" | "Plan" | "Ask";

export const GOAL_TYPES: GoalType[] = ["generic", "runTestsAndFix", "addEndpoint", "improveTypes"];
export const MODES: RunMode[] = ["Agent", "Plan", "Ask"];

export interface ParsedArgs {
  command: string;
  task?: string;
  maxSteps?: number;
  goalType?: GoalType;
  mode?: RunMode;
  verbose?: boolean;
  timeoutMs?: number;
  stream?: boolean;
  dryRun?: boolean;
}

export function parseArgs(args: string[]): ParsedArgs {
  const verbose = args.includes("--verbose");
  const stream = !args.includes("--no-stream");
  const dryRun = args.includes("--dry-run");
  const command = args[0];

  let maxSteps: number | undefined;
  let goalType: GoalType | undefined;
  let mode: RunMode | undefined;
  let timeoutMs: number | undefined;
  const skip = new Set<number>();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--max-steps" && args[i + 1] != null) {
      const n = parseInt(args[i + 1], 10);
      if (!Number.isNaN(n)) maxSteps = n;
      skip.add(i).add(i + 1);
    }
    if (args[i] === "--goal-type" && args[i + 1] != null) {
      const g = args[i + 1];
      if (GOAL_TYPES.includes(g as GoalType)) goalType = g as GoalType;
      skip.add(i).add(i + 1);
    }
    if (args[i] === "--mode" && args[i + 1] != null) {
      const m = args[i + 1];
      if (MODES.includes(m as RunMode)) mode = m as RunMode;
      skip.add(i).add(i + 1);
    }
    if ((args[i] === "--timeout" || args[i] === "--timeout-ms") && args[i + 1] != null) {
      const n = parseInt(args[i + 1], 10);
      if (!Number.isNaN(n)) timeoutMs = n;
      skip.add(i).add(i + 1);
    }
  }

  if (command === "run") {
    const taskParts: string[] = [];
    for (let i = 1; i < args.length; i++) {
      if (skip.has(i) || args[i] === "--verbose" || args[i] === "--no-stream" || args[i] === "--dry-run") continue;
      taskParts.push(args[i]);
    }
    const task = taskParts.length > 0 ? taskParts.join(" ").trim() : undefined;
    return { command, task, maxSteps, goalType, mode, verbose, timeoutMs, stream, dryRun };
  }
  return { command, maxSteps, goalType, mode, verbose, timeoutMs, stream, dryRun };
}
