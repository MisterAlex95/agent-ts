import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { runAgentLoop, TaskTimeoutError } from "../agent/index.js";
import { runAgentLoopWithPiAgent } from "../agent/loop/piAgentRunner.js";
import { indexWorkspaceRepository, indexWorkspaceIncremental } from "../rag/indexer.js";
import { registerTask, abortTask, unregisterTask } from "./taskStore.js";
import { recordRun, getMetrics, getRecentRuns, runRowToRecord } from "./metrics.js";
import { recordIndexRun, getIndexStatus, getRunById } from "./db.js";
import {
  getBoard,
  listBoards,
  createBoard,
  updateBoard,
  getColumnBySlug,
  getColumnById,
  createCard,
  updateCard,
  deleteCard,
} from "./kanbanDb.js";
import type { TaskRequestBody, TaskResponseBody, GoalType, RunMode } from "./schema.js";
import type { StepEvent } from "../agent/loop/types.js";
import { logger } from "../logger.js";
import { getWorkspaceRoot, listWorkspaceDirectEntries, readWorkspaceFile } from "../runtime/workspaceManager.js";
import { isProtectedPath } from "../tools/file/helpers.js";
import { generateAndCreateAiCards } from "../kanban/aiCards.js";

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
    const usePiAgent = process.env.AGENT_USE_PI_AGENT === "1";
    try {
      const focusPaths =
        Array.isArray(body.focusPaths) &&
        body.focusPaths.every((p) => typeof p === "string")
          ? (body.focusPaths as string[])
          : undefined;
      const loopOptions = {
        maxSteps,
        goalType,
        mode,
        verbose: body.verbose,
        dryRun: body.dryRun,
        timeoutMs,
        history: Array.isArray(body.history) ? body.history : undefined,
        focusPaths,
        signal: controller.signal,
        onStep: (ev: StepEvent) => writeSSE(res, { type: "step", ...ev }),
        onPlannerChunk: (delta: string) => writeSSE(res, { type: "planner_delta", delta }),
        onAnswerChunk: (delta: string) => writeSSE(res, { type: "answer_delta", delta }),
      };
      const result = usePiAgent
        ? await runAgentLoopWithPiAgent(body.task, loopOptions)
        : await runAgentLoop(body.task, loopOptions);
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
        task: body.task,
        answer: result.answer ?? null,
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
        task: body.task,
        answer: result.answer ?? null,
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

  app.get("/index/status", (_req: Request, res: Response) => {
    const status = getIndexStatus();
    if (!status) {
      res.json({ lastIndexedAt: null, indexedFiles: 0, indexedChunks: 0 });
      return;
    }
    res.json({
      lastIndexedAt: status.last_at,
      indexedFiles: status.indexed_files,
      indexedChunks: status.indexed_chunks,
    });
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
      recordIndexRun(result.indexedFiles, result.indexedChunks);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Indexing failed", { error: message });
      res.status(500).json({ error: message });
    }
  });

  app.get("/runs/:id", (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Missing run id" });
      return;
    }
    const row = getRunById(id);
    if (!row) {
      res.status(404).json({ error: "Run not found", id });
      return;
    }
    res.json(runRowToRecord(row));
  });

  // Kanban
  const DEFAULT_BOARD_ID = 1;

  app.get("/kanban/boards", (_req: Request, res: Response) => {
    res.json({ boards: listBoards() });
  });

  app.post("/kanban/boards", (req: Request, res: Response) => {
    const body = req.body as { name?: string; project_path?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "Missing or invalid 'name'" });
      return;
    }
    const projectPath = typeof body.project_path === "string" ? body.project_path.trim() || null : null;
    const board = createBoard(name, projectPath);
    res.status(201).json(board);
  });

  app.patch("/kanban/boards/:id", (req: Request, res: Response) => {
    const idRaw = req.params.id;
    const id = typeof idRaw === "string" ? Number.parseInt(idRaw, 10) : NaN;
    if (Number.isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid board id" });
      return;
    }
    const body = req.body as { name?: string; project_path?: string };
    const patch: { name?: string; project_path?: string | null } = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (body.project_path !== undefined) patch.project_path = typeof body.project_path === "string" ? body.project_path.trim() || null : null;
    const board = updateBoard(id, patch);
    if (!board) {
      res.status(404).json({ error: "Board not found", id });
      return;
    }
    res.json(board);
  });

  app.post("/kanban/boards/:id/ai-cards", async (req: Request, res: Response) => {
    const idRaw = req.params.id;
    const id = typeof idRaw === "string" ? Number.parseInt(idRaw, 10) : NaN;
    if (Number.isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid board id" });
      return;
    }
    const body = req.body as { prompt?: string };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    try {
      const result = await generateAndCreateAiCards(id, prompt);
      if (result.error && result.created.length === 0) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json({ created: result.created, error: result.error ?? undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("AI cards failed", { boardId: id, error: message });
      res.status(500).json({ error: message });
    }
  });

  app.get("/kanban/board", (_req: Request, res: Response) => {
    const board = getBoard(DEFAULT_BOARD_ID);
    if (!board) {
      res.status(404).json({ error: "Board not found" });
      return;
    }
    res.json(board);
  });

  app.get("/kanban/board/:id", (req: Request, res: Response) => {
    const idRaw = req.params.id;
    const id = typeof idRaw === "string" ? Number.parseInt(idRaw, 10) : NaN;
    if (Number.isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid board id" });
      return;
    }
    const board = getBoard(id);
    if (!board) {
      res.status(404).json({ error: "Board not found", id });
      return;
    }
    res.json(board);
  });

  app.post("/kanban/cards", (req: Request, res: Response) => {
    const body = req.body as { title?: string; description?: string; column_id?: number; column_slug?: string; board_id?: number };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "Missing or invalid 'title'" });
      return;
    }
    const boardId = typeof body.board_id === "number" ? body.board_id : DEFAULT_BOARD_ID;
    let columnId: number | undefined = typeof body.column_id === "number" ? body.column_id : undefined;
    if (columnId === undefined && typeof body.column_slug === "string") {
      const col = getColumnBySlug(boardId, body.column_slug.trim());
      if (!col) {
        res.status(400).json({ error: "Unknown column_slug" });
        return;
      }
      columnId = col.id;
    }
    if (columnId === undefined) {
      const todoCol = getColumnBySlug(boardId, "todo");
      columnId = todoCol?.id;
    }
    if (columnId === undefined) {
      res.status(400).json({ error: "Missing column_id or column_slug, and no default 'todo' column" });
      return;
    }
    const col = getColumnById(columnId);
    if (!col) {
      res.status(400).json({ error: "Column not found" });
      return;
    }
    const card = createCard({
      columnId,
      title,
      description: typeof body.description === "string" ? body.description : null,
    });
    res.status(201).json(card);
  });

  app.patch("/kanban/cards/:id", (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Missing card id" });
      return;
    }
    const body = req.body as { title?: string; description?: string; column_id?: number };
    const patch: { title?: string; description?: string | null; column_id?: number } = {};
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (body.description !== undefined) patch.description = typeof body.description === "string" ? body.description : null;
    if (typeof body.column_id === "number") patch.column_id = body.column_id;
    const card = updateCard(id, patch);
    if (!card) {
      res.status(404).json({ error: "Card not found", id });
      return;
    }
    res.json(card);
  });

  app.delete("/kanban/cards/:id", (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Missing card id" });
      return;
    }
    const ok = deleteCard(id);
    if (!ok) {
      res.status(404).json({ error: "Card not found", id });
      return;
    }
    res.status(204).send();
  });

  app.get("/kanban/scheduler/status", async (_req: Request, res: Response) => {
    const { getSchedulerStatus } = await import("../scheduler/kanbanAgentScheduler.js");
    res.json(getSchedulerStatus());
  });

  app.post("/kanban/scheduler/run-once", async (_req: Request, res: Response) => {
    const { runKanbanSchedulerOnce } = await import("../scheduler/kanbanAgentScheduler.js");
    try {
      const result = await runKanbanSchedulerOnce();
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Kanban scheduler run-once failed", { error: message });
      res.status(500).json({ error: message });
    }
  });
}

