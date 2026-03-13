/**
 * CLI command: agent run "Task description" [options]
 * POST /tasks or POST /tasks/stream to run a task.
 */

import type { GoalType, RunMode } from "../args.js";
import { BASE_URL } from "../args.js";

export interface RunOptions {
  maxSteps?: number;
  goalType?: GoalType;
  mode?: RunMode;
  verbose?: boolean;
  timeoutMs?: number;
  dryRun?: boolean;
}

export async function runTaskStream(task: string, options: RunOptions): Promise<void> {
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

export async function runTask(task: string, options: RunOptions): Promise<void> {
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
