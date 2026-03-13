import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { runAgentLoop } from "../agent/agentLoop.js";
import { indexWorkspaceRepository, indexWorkspaceIncremental } from "../rag/indexer.js";
import { registerTask, abortTask, unregisterTask } from "./taskStore.js";
import { recordRun, getMetrics } from "./metrics.js";
import type { TaskRequestBody, TaskResponseBody } from "./schema.js";

function writeSSE(res: Response, data: unknown): void {
  res.write("data: " + JSON.stringify(data) + "\n\n");
}

export function registerRoutes(app: Express): void {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.get("/metrics", (_req: Request, res: Response) => {
    res.json(getMetrics());
  });

  app.post("/tasks/stream", async (req: Request, res: Response) => {
    const { task, maxSteps, goalType, mode, verbose, dryRun, timeoutMs, history } = req.body as Partial<TaskRequestBody>;
    if (!task || typeof task !== "string") {
      res.status(400).json({ error: "Missing or invalid 'task' in body" });
      return;
    }
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
      const result = await runAgentLoop(task, {
        maxSteps,
        goalType,
        mode,
        verbose,
        dryRun,
        timeoutMs,
        history: Array.isArray(history) ? history : undefined,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      const isTimeout = typeof message === "string" && message.includes("timeout");
      if (isAbort) {
        writeSSE(res, { type: "cancelled", message: "Task cancelled" });
      } else if (isTimeout) {
        writeSSE(res, { type: "timeout", error: message });
      } else {
        writeSSE(res, { type: "error", error: message });
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
      const { task, maxSteps, goalType, mode, verbose, dryRun, timeoutMs, history } = req.body as Partial<TaskRequestBody>;
      if (!task || typeof task !== "string") {
        res.status(400).json({ error: "Missing or invalid 'task' in body" });
        return;
      }
      const result: TaskResponseBody = await runAgentLoop(task, {
        maxSteps,
        goalType,
        mode,
        verbose,
        dryRun,
        timeoutMs,
        history: Array.isArray(history) ? history : undefined,
      });
      recordRun({
        steps: result.steps,
        durationMs: Date.now() - start,
        finished: result.finished,
        cancelled: result.cancelled,
      });
      res.json(result);
    } catch (err) {
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

