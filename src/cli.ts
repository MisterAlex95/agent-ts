#!/usr/bin/env node
/**
 * CLI wrapper for the agent HTTP API.
 * Usage:
 *   agent index
 *   agent run "Your task description" [--max-steps N] [--goal-type TYPE] [--verbose]
 */

const BASE_URL = process.env.AGENT_API_URL ?? "http://localhost:3000";

type GoalType = "generic" | "runTestsAndFix" | "addEndpoint" | "improveTypes";

const GOAL_TYPES: GoalType[] = ["generic", "runTestsAndFix", "addEndpoint", "improveTypes"];

function parseArgs(args: string[]): { command: string; task?: string; maxSteps?: number; goalType?: GoalType; verbose?: boolean; timeoutMs?: number } {
  const verbose = args.includes("--verbose");
  const command = args[0];

  let maxSteps: number | undefined;
  let goalType: GoalType | undefined;
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
    if ((args[i] === "--timeout" || args[i] === "--timeout-ms") && args[i + 1] != null) {
      const n = parseInt(args[i + 1], 10);
      if (!Number.isNaN(n)) timeoutMs = n;
      skip.add(i).add(i + 1);
    }
  }

  if (command === "run") {
    const taskParts: string[] = [];
    for (let i = 1; i < args.length; i++) {
      if (skip.has(i) || args[i] === "--verbose") continue;
      taskParts.push(args[i]);
    }
    const task = taskParts.length > 0 ? taskParts.join(" ").trim() : undefined;
    return { command, task, maxSteps, goalType, verbose, timeoutMs };
  }
  return { command, maxSteps, goalType, verbose, timeoutMs };
}

async function runIndex(): Promise<void> {
  const res = await fetch(`${BASE_URL}/index`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    console.error("Index failed:", res.status, text);
    process.exit(1);
  }
  const data = (await res.json()) as { indexedFiles?: number; indexedChunks?: number };
  console.log(`Indexed ${data.indexedFiles ?? 0} files, ${data.indexedChunks ?? 0} chunks.`);
}

async function runTask(task: string, options: { maxSteps?: number; goalType?: GoalType; verbose?: boolean; timeoutMs?: number }): Promise<void> {
  const body: Record<string, unknown> = { task };
  if (options.maxSteps != null) body.maxSteps = options.maxSteps;
  if (options.goalType != null) body.goalType = options.goalType;
  if (options.verbose != null) body.verbose = options.verbose;
  if (options.timeoutMs != null) body.timeoutMs = options.timeoutMs;

  const res = await fetch(`${BASE_URL}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Task failed:", res.status, text);
    process.exit(1);
  }

  const data = (await res.json()) as {
    finished?: boolean;
    steps?: number;
    memory?: { task?: string; actions?: Array<{ tool?: string; input?: unknown; output?: unknown }> };
    answer?: string | null;
    trace?: Array<{ timestamp: string; tool: string; params?: unknown; error?: string }>;
  };

  if (options.verbose && Array.isArray(data.trace)) {
    console.log("--- Trace ---");
    for (const entry of data.trace) {
      console.log(`[${entry.timestamp}] ${entry.tool}`, entry.params ?? "");
      if (entry.error) console.log("  Error:", entry.error);
    }
    console.log("---");
  }

  if (data.answer) {
    console.log("\n" + data.answer);
  }
  console.log(`\nDone in ${data.steps ?? 0} steps.`);
}

function printUsage(): void {
  console.log(`
Usage:
  agent index
  agent run "Task description" [--max-steps N] [--goal-type TYPE] [--verbose] [--timeout MS]

Options:
  --max-steps N    Max steps (default: 8)
  --goal-type      generic | runTestsAndFix | addEndpoint | improveTypes
  --verbose        Print structured trace
  --timeout MS     Task timeout in ms (default: 300000)

Env:
  AGENT_API_URL    Base URL (default: http://localhost:3000)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, task, maxSteps, goalType, verbose, timeoutMs } = parseArgs(args);

  if (!command || command === "help" || command === "-h" || command === "--help") {
    printUsage();
    process.exit(0);
  }

  if (command === "index") {
    await runIndex();
    return;
  }

  if (command === "run") {
    if (!task) {
      console.error("Missing task. Usage: agent run \"Your task here\"");
      process.exit(1);
    }
    await runTask(task, { maxSteps, goalType, verbose, timeoutMs });
    return;
  }

  console.error("Unknown command:", command);
  printUsage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
