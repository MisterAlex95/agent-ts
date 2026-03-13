import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { runAgentLoop, TaskTimeoutError } from "../agent/index.js";
import { indexWorkspaceRepository, indexWorkspaceIncremental } from "../rag/indexer.js";
import { registerTask, abortTask, unregisterTask } from "./taskStore.js";
import { recordRun, getMetrics } from "./metrics.js";
import type { TaskRequestBody, TaskResponseBody, GoalType, RunMode } from "./schema.js";

const MAX_STEPS_MIN = 1;
const MAX_STEPS_MAX = 64;
const TIMEOUT_MS_MIN = 1000;
const TIMEOUT_MS_MAX = 3600000; // 1h
const VALID_GOAL_TYPES = ["generic", "runTestsAndFix", "addEndpoint", "improveTypes"] as const;
const VALID_MODES = ["Agent", "Plan", "Ask"] as const;

function writeSSE(res: Response, data: unknown): void {
  res.write("data: " + JSON.stringify(data) + "\n\n");
}

function clampNum(value: unknown, min: number, max: number, defaultVal: number): number {
  const n = typeof value === "number" && !Number.isNaN(value) ? value : defaultVal;
  return Math.max(min, Math.min(max, n));
}

function validateTaskBody(body: Partial<TaskRequestBody>): {
  maxSteps: number;
  timeoutMs: number;
  goalType?: GoalType;
  mode?: RunMode;
} {
  const maxSteps = clampNum(body.maxSteps, MAX_STEPS_MIN, MAX_STEPS_MAX, 12);
  const timeoutMs = clampNum(body.timeoutMs, TIMEOUT_MS_MIN, TIMEOUT_MS_MAX, 5 * 60 * 1000);
  const goalType = body.goalType && VALID_GOAL_TYPES.includes(body.goalType) ? (body.goalType as GoalType) : undefined;
  const mode = body.mode && VALID_MODES.includes(body.mode) ? (body.mode as RunMode) : undefined;
  return { maxSteps, timeoutMs, goalType, mode };
}

export function registerRoutes(app: Express): void {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.get("/metrics", (_req: Request, res: Response) => {
    res.json(getMetrics());
  });

  app.post("/tasks/stream", async (req: Request, res: Response) => {
    const body = req.body as Partial<TaskRequestBody>;
    if (!body.task || typeof body.task !== "string") {
      res.status(400).json({ error: "Missing or invalid 'task' in body" });
      return;
    }
    const { maxSteps, timeoutMs, goalType, mode } = validateTaskBody(body);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const taskId = crypto.randomUUID();
    const controller = new AbortController();
    registerTask(taskId, controller);
    writeSSE(res, { type: "started", taskId });

    const streamStart = Date.now();
    try {
      const result = await runAgentLoop(body.task, {
        maxSteps,
        goalType,
        mode,
        verbose: body.verbose,
        dryRun: body.dryRun,
        timeoutMs,
        history: Array.isArray(body.history) ? body.history : undefined,
        signal: controller.signal,
        onStep: (ev) => writeSSE(res, { type: "step", ...ev }),
        onPlannerChunk: (delta) => writeSSE(res, { type: "planner_delta", delta }),
      });
      if (result.cancelled) {
        writeSSE(res, { type: "cancelled", ...result });
      } else {
        writeSSE(res, { type: "done", ...result });
      }
      recordRun({
        steps: result.steps,
        durationMs: Date.now() - streamStart,
        finished: result.finished,
        cancelled: result.cancelled,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const isTimeout = err instanceof TaskTimeoutError;
      if (isAbort) {
        writeSSE(res, { type: "cancelled", message: "Task cancelled" });
      } else {
        writeSSE(res, { type: "error", error: message, timeout: isTimeout });
      }
    } finally {
      unregisterTask(taskId);
      res.end();
    }
  });

  app.delete("/tasks/:id", (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Missing task id" });
      return;
    }
    const cancelled = abortTask(id);
    if (cancelled) {
      res.status(202).json({ cancelled: true, taskId: id });
    } else {
      res.status(404).json({ error: "Task not found or already finished", taskId: id });
    }
  });

  app.post("/tasks", async (req: Request, res: Response) => {
    const start = Date.now();
    try {
      const body = req.body as Partial<TaskRequestBody>;
      if (!body.task || typeof body.task !== "string") {
        res.status(400).json({ error: "Missing or invalid 'task' in body" });
        return;
      }
      const { maxSteps, timeoutMs, goalType, mode } = validateTaskBody(body);
      const result: TaskResponseBody = await runAgentLoop(body.task, {
        maxSteps,
        goalType,
        mode,
        verbose: body.verbose,
        dryRun: body.dryRun,
        timeoutMs,
        history: Array.isArray(body.history) ? body.history : undefined,
      });
      recordRun({
        steps: result.steps,
        durationMs: Date.now() - start,
        finished: result.finished,
        cancelled: result.cancelled,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof TaskTimeoutError) {
        res.status(408).json({ error: err.message, timeout: true });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/index", async (req: Request, res: Response) => {
    try {
      const incremental =
        req.query.incremental === "true" ||
        Boolean((req.body as { incremental?: boolean })?.incremental);
      const result = incremental
        ? await indexWorkspaceIncremental()
        : await indexWorkspaceRepository();
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });
}

