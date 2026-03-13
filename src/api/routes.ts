import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { runAgentLoop, TaskTimeoutError } from "../agent/index.js";
import { indexWorkspaceRepository, indexWorkspaceIncremental } from "../rag/indexer.js";
import { registerTask, abortTask, unregisterTask } from "./taskStore.js";
import { recordRun, getMetrics, getRecentRuns } from "./metrics.js";
import type { TaskRequestBody, TaskResponseBody, GoalType, RunMode } from "./schema.js";
import { logger } from "../logger.js";
import { getWorkspaceRoot, listWorkspaceDirectEntries, readWorkspaceFile } from "../runtime/workspaceManager.js";
import { isProtectedPath } from "../tools/file/helpers.js";

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
    logger.debug("HTTP GET /health");
    res.json({ status: "ok" });
  });

  app.get("/metrics", (_req: Request, res: Response) => {
    logger.debug("HTTP GET /metrics");
    res.json(getMetrics());
  });

  app.get("/runs", (req: Request, res: Response) => {
    logger.debug("HTTP GET /runs");
    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) || 20 : 20;
    res.json({ runs: getRecentRuns(limit) });
  });

  app.post("/tasks/stream", async (req: Request, res: Response) => {
    const body = req.body as Partial<TaskRequestBody>;
    if (!body.task || typeof body.task !== "string") {
      res.status(400).json({ error: "Missing or invalid 'task' in body" });
      return;
    }
    const { maxSteps, timeoutMs, goalType, mode } = validateTaskBody(body);
    logger.info("HTTP POST /tasks/stream", {
      taskPreview: body.task.slice(0, 120),
      maxSteps,
      timeoutMs,
      goalType: goalType ?? "auto",
      mode: mode ?? "Agent",
      verbose: body.verbose,
      dryRun: body.dryRun,
    });
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
      const focusPaths =
        Array.isArray(body.focusPaths) &&
        body.focusPaths.every((p) => typeof p === "string")
          ? (body.focusPaths as string[])
          : undefined;
      const result = await runAgentLoop(body.task, {
        maxSteps,
        goalType,
        mode,
        verbose: body.verbose,
        dryRun: body.dryRun,
        timeoutMs,
        history: Array.isArray(body.history) ? body.history : undefined,
        focusPaths,
        signal: controller.signal,
        onStep: (ev) => writeSSE(res, { type: "step", ...ev }),
        onPlannerChunk: (delta) => writeSSE(res, { type: "planner_delta", delta }),
        onAnswerChunk: (delta) => writeSSE(res, { type: "answer_delta", delta }),
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
        id: taskId,
        taskPreview: body.task.slice(0, 120),
        goalType: (goalType ?? "auto") as string,
        mode: (mode ?? "Agent") as string,
      });
      logger.info("Streamed task finished", {
        taskId,
        steps: result.steps,
        finished: result.finished,
        cancelled: result.cancelled,
        durationMs: Date.now() - streamStart,
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
      if (!isAbort) {
        recordRun({
          steps: 0,
          durationMs: Date.now() - streamStart,
          finished: false,
          cancelled: false,
          id: taskId,
          taskPreview: body.task.slice(0, 120),
          goalType: (goalType ?? "auto") as string,
          mode: (mode ?? "Agent") as string,
          error: message,
        });
      }
      logger.error("Streamed task failed", {
        taskId,
        error: message,
        timeout: isTimeout,
      });
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
    logger.info("HTTP DELETE /tasks/:id", { taskId: id });
    const cancelled = abortTask(id);
    if (cancelled) {
      logger.info("Task cancelled via DELETE", { taskId: id });
      res.status(202).json({ cancelled: true, taskId: id });
    } else {
      logger.warn("Task cancel failed (not found or finished)", { taskId: id });
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
      logger.info("HTTP POST /tasks", {
        taskPreview: body.task.slice(0, 120),
        maxSteps,
        timeoutMs,
        goalType: goalType ?? "auto",
        mode: mode ?? "Agent",
        verbose: body.verbose,
        dryRun: body.dryRun,
      });
      const focusPaths =
        Array.isArray(body.focusPaths) &&
        body.focusPaths.every((p) => typeof p === "string")
          ? (body.focusPaths as string[])
          : undefined;
      const result: TaskResponseBody = await runAgentLoop(body.task, {
        maxSteps,
        goalType,
        mode,
        verbose: body.verbose,
        dryRun: body.dryRun,
        timeoutMs,
        history: Array.isArray(body.history) ? body.history : undefined,
        focusPaths,
      });
      recordRun({
        steps: result.steps,
        durationMs: Date.now() - start,
        finished: result.finished,
        cancelled: result.cancelled,
        taskPreview: body.task.slice(0, 120),
        goalType: (goalType ?? "auto") as string,
        mode: (mode ?? "Agent") as string,
      });
      logger.info("Task finished", {
        steps: result.steps,
        finished: result.finished,
        cancelled: result.cancelled,
        durationMs: Date.now() - start,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof TaskTimeoutError) {
        logger.error("Task timeout", { error: err.message });
        recordRun({
          steps: 0,
          durationMs: Date.now() - start,
          finished: false,
          cancelled: false,
          taskPreview: (req.body as { task?: string }).task?.slice(0, 120),
          goalType: "auto",
          mode: "Agent",
          error: err.message,
        });
        res.status(408).json({ error: err.message, timeout: true });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Task failed", { error: message });
      recordRun({
        steps: 0,
        durationMs: Date.now() - start,
        finished: false,
        cancelled: false,
        taskPreview: (req.body as { task?: string }).task?.slice(0, 120),
        goalType: "auto",
        mode: "Agent",
        error: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.get("/files/list", async (req: Request, res: Response) => {
    const pathParam = typeof req.query.path === "string" ? req.query.path : ".";
    try {
      const root = getWorkspaceRoot();
      const entries = await listWorkspaceDirectEntries(pathParam);
      res.json({ root, entries });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.debug("GET /files/list failed", { path: pathParam, error: message });
      res.status(500).json({ error: message });
    }
  });

  app.get("/files/read", async (req: Request, res: Response) => {
    const pathParam = typeof req.query.path === "string" ? req.query.path : "";
    if (!pathParam.trim()) {
      res.status(400).json({ error: "Missing or invalid path" });
      return;
    }
    if (isProtectedPath(pathParam)) {
      res.status(403).json({ error: "Access to this path is not allowed" });
      return;
    }
    try {
      const content = await readWorkspaceFile(pathParam);
      const maxChars = 100_000;
      const truncated = content.length > maxChars;
      const snippet = truncated ? content.slice(0, maxChars) + "\n\n... (truncated)" : content;
      res.type("text/plain").send(snippet);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.debug("GET /files/read failed", { path: pathParam, error: message });
      res.status(500).json({ error: message });
    }
  });

  app.post("/index", async (req: Request, res: Response) => {
    try {
      const incremental =
        req.query.incremental === "true" ||
        Boolean((req.body as { incremental?: boolean })?.incremental);
      logger.info("HTTP POST /index", { incremental });
      const result = incremental
        ? await indexWorkspaceIncremental()
        : await indexWorkspaceRepository();
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Indexing failed", { error: message });
      res.status(500).json({ error: message });
    }
  });
}

