/**
 * CLI command: agent run "Task description" [options]
 * POST /tasks or POST /tasks/stream to run a task.
 */

import type { GoalType, RunMode } from "../args.js";
import { BASE_URL } from "../args.js";
import { logger } from "../../logger.js";

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
    logger.error("Task (stream) failed", { status: res.status, body: text });
    process.exit(1);
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) {
    logger.error("Task stream failed: no response body");
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
              if (data.taskId && options.verbose) {
                logger.info("Task started", {
                  taskId: data.taskId,
                  cancelHint: "use DELETE /tasks/{taskId} to cancel",
                });
              }
              break;
            case "step":
              logger.info("Step", {
                step: data.step ?? "?",
                tool: data.tool ?? "?",
                params: data.params ?? "",
                error: data.error,
              });
              break;
            case "planner_delta":
              if (options.verbose && typeof data.delta === "string") process.stdout.write(data.delta);
              break;
            case "done":
              lastAnswer = data.answer ?? null;
              lastSteps = data.steps ?? 0;
              break;
            case "timeout":
              logger.error("Task timed out");
              process.exit(1);
              break;
            case "cancelled":
              logger.warn("Task cancelled");
              process.exit(1);
              break;
            case "error":
              logger.error("Task error", { error: data.error ?? "Unknown" });
              process.exit(1);
              break;
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
  logger.info("Task completed (stream)", { steps: lastSteps });
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
    logger.error("Task failed", { status: res.status, body: text });
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
    logger.info("Trace start");
    for (const entry of data.trace) {
      logger.info("Trace entry", {
        timestamp: entry.timestamp,
        tool: entry.tool,
        params: entry.params ?? "",
        error: entry.error,
      });
    }
    logger.info("Trace end");
  }

  if (data.answer) {
    logger.info("Task answer", { answer: data.answer });
  }
  logger.info("Task completed", { steps: data.steps ?? 0 });
}
