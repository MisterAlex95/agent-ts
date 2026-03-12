import type { Express, Request, Response } from "express";
import { runAgentLoop } from "../agent/agentLoop.js";
import { indexWorkspaceRepository } from "../rag/indexer.js";
import type { TaskRequestBody, TaskResponseBody } from "./schema.js";

export function registerRoutes(app: Express): void {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/tasks", async (req: Request, res: Response) => {
    try {
      const { task, maxSteps, goalType } = req.body as Partial<TaskRequestBody>;
      if (!task || typeof task !== "string") {
        res.status(400).json({ error: "Missing or invalid 'task' in body" });
        return;
      }
      const result: TaskResponseBody = await runAgentLoop(task, {
        maxSteps,
        goalType,
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

