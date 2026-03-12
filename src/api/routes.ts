import type { Express, Request, Response } from "express";
import { runAgentLoop } from "../agent/agentLoop.js";
import { indexWorkspaceRepository } from "../rag/indexer.js";
import type { TaskRequestBody, TaskResponseBody } from "./schema.js";

function writeSSE(res: Response, data: unknown): void {
  res.write("data: " + JSON.stringify(data) + "\n\n");
}

export function registerRoutes(app: Express): void {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
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

    try {
      const result = await runAgentLoop(task, {
        maxSteps,
        goalType,
        mode,
        verbose,
        dryRun,
        timeoutMs,
        history: Array.isArray(history) ? history : undefined,
        onStep: (ev) => writeSSE(res, { type: "step", ...ev }),
      });
      writeSSE(res, { type: "done", ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeSSE(res, { type: "error", error: message });
    } finally {
      res.end();
    }
  });

  app.post("/tasks", async (req: Request, res: Response) => {
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
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/index", async (_req: Request, res: Response) => {
    try {
      const result = await indexWorkspaceRepository();
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });
}

