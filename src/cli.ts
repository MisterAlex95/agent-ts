#!/usr/bin/env node
/**
 * CLI wrapper for the agent HTTP API.
 * Usage:
 *   agent index
 *   agent run "Your task description" [--max-steps N] [--goal-type TYPE] [--verbose]
 */

const BASE_URL = process.env.AGENT_API_URL ?? "http://localhost:3000";

type GoalType = "generic" | "runTestsAndFix" | "addEndpoint" | "improveTypes";
type RunMode = "Agent" | "Plan" | "Ask";

const GOAL_TYPES: GoalType[] = ["generic", "runTestsAndFix", "addEndpoint", "improveTypes"];
const MODES: RunMode[] = ["Agent", "Plan", "Ask"];

function parseArgs(args: string[]): {
  command: string;
  task?: string;
  maxSteps?: number;
  goalType?: GoalType;
  mode?: RunMode;
  verbose?: boolean;
  timeoutMs?: number;
  stream?: boolean;
  dryRun?: boolean;
} {
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

async function runTaskStream(
  task: string,
  options: {
    maxSteps?: number;
    goalType?: GoalType;
    mode?: RunMode;
    verbose?: boolean;
    timeoutMs?: number;
    dryRun?: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = { task };
  if (options.maxSteps != null) body.maxSteps = options.maxSteps;
  if (options.goalType != null) body.goalType = options.goalType;
  if (options.mode != null) body.mode = options.mode;
  if (options.verbose != null) body.verbose = options.verbose;
  if (options.timeoutMs != null) body.timeoutMs = options.timeoutMs;
  if (options.dryRun != null) body.dryRun = options.dryRun;

  const res = await fetch(`${BASE_URL}/tasks/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Task failed:", res.status, text);
    process.exit(1);
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) {
    console.error("No response body");
    process.exit(1);
  }

  let buffer = "";
  let lastAnswer: string | null = null;
  let lastSteps = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6)) as {
            type?: string;
            taskId?: string;
            step?: number;
            tool?: string;
            params?: unknown;
            error?: string;
            delta?: string;
            answer?: string | null;
            steps?: number;
          };
          switch (data.type) {
            case "started":
              if (data.taskId && options.verbose) console.log("Task ID:", data.taskId, "(use DELETE /tasks/" + data.taskId + " to cancel)");
              break;
            case "step":
              console.log(`Step ${data.step ?? "?"}: ${data.tool ?? "?"}`, data.params ?? "");
              if (data.error && options.verbose) console.log("  Error:", data.error);
              break;
            case "planner_delta":
              if (options.verbose && typeof data.delta === "string") process.stdout.write(data.delta);
              break;
            case "done":
              lastAnswer = data.answer ?? null;
              lastSteps = data.steps ?? 0;
              break;
            case "timeout":
              console.error("\nTask timed out.");
              process.exit(1);
            case "cancelled":
              console.error("\nTask cancelled.");
              process.exit(1);
            case "error":
              console.error("Error:", data.error ?? "Unknown");
              process.exit(1);
            default:
              break;
          }
        } catch {
          // skip malformed lines
        }
      }
    }
    if (buffer.startsWith("data: ")) {
      try {
        const data = JSON.parse(buffer.slice(6)) as { type?: string; answer?: string | null; steps?: number };
        if (data.type === "done") {
          lastAnswer = data.answer ?? null;
          lastSteps = data.steps ?? 0;
        }
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (lastAnswer) console.log("\n" + lastAnswer);
  console.log(`\nDone in ${lastSteps} steps.`);
}

async function runTask(
  task: string,
  options: {
    maxSteps?: number;
    goalType?: GoalType;
    mode?: RunMode;
    verbose?: boolean;
    timeoutMs?: number;
    dryRun?: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = { task };
  if (options.maxSteps != null) body.maxSteps = options.maxSteps;
  if (options.goalType != null) body.goalType = options.goalType;
  if (options.mode != null) body.mode = options.mode;
  if (options.verbose != null) body.verbose = options.verbose;
  if (options.timeoutMs != null) body.timeoutMs = options.timeoutMs;
  if (options.dryRun != null) body.dryRun = options.dryRun;

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
  agent run "Task description" [--max-steps N] [--mode MODE] [--goal-type TYPE] [--verbose] [--timeout MS]

Options:
  --max-steps N    Max steps (default: 8)
  --mode           Agent | Plan | Ask (default: Agent). Plan = plan only; Ask = read-only.
  --goal-type      generic | runTestsAndFix | addEndpoint | improveTypes (omit to auto-detect)
  --verbose        Print structured trace (and planner stream when using --stream)
  --no-stream      Wait for full result instead of streaming steps (default: stream)
  --dry-run        Simulate writes/commands, no side effects
  --timeout MS     Task timeout in ms (default: 300000)

Env:
  AGENT_API_URL    Base URL (default: http://localhost:3000)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, task, maxSteps, goalType, mode, verbose, timeoutMs, stream, dryRun } = parseArgs(args);

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
    const runOpts = { maxSteps, goalType, mode, verbose, timeoutMs, dryRun };
    if (stream) {
      await runTaskStream(task, runOpts);
    } else {
      await runTask(task, runOpts);
    }
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
