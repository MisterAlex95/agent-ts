import crypto from "node:crypto";
import { runAgentLoop, TaskTimeoutError } from "../agent/index.js";
import { runAgentLoopWithPiAgent } from "../agent/loop/piAgentRunner.js";
import { recordRun } from "../api/metrics.js";
import {
  getBoard,
  getCardsInColumnBySlug,
  getColumnBySlug,
  updateCard,
  type KanbanCardRow,
} from "../api/kanbanDb.js";
import { logger } from "../logger.js";

const DEFAULT_BOARD_ID = 1;
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_STEPS = 12;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Column slug to move card to after successful agent run. */
const COLUMN_AFTER_SUCCESS = "to_test";

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let agentBusy = false;
let currentCardId: string | null = null;
let currentRunId: string | null = null;

export function getSchedulerStatus(): { busy: boolean; cardId: string | null; runId: string | null } {
  return { busy: agentBusy, cardId: currentCardId, runId: currentRunId };
}

function getIntervalMs(): number {
  const raw = process.env.KANBAN_SCHEDULER_INTERVAL_MS;
  if (raw === undefined || raw === "") return DEFAULT_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n < 60_000 ? DEFAULT_INTERVAL_MS : n;
}

function getMaxSteps(): number {
  const raw = process.env.KANBAN_SCHEDULER_MAX_STEPS;
  if (raw === undefined || raw === "") return DEFAULT_MAX_STEPS;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n < 1 ? DEFAULT_MAX_STEPS : Math.min(n, 64);
}

function getTimeoutMs(): number {
  const raw = process.env.KANBAN_SCHEDULER_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n < 1000 ? DEFAULT_TIMEOUT_MS : Math.min(n, 3600000);
}

/** Pick next card to work on: prefer "todo", then "in_progress" (stale). */
function pickNextCard(): KanbanCardRow | null {
  const todo = getCardsInColumnBySlug(DEFAULT_BOARD_ID, "todo");
  if (todo.length > 0) return todo[0];
  const inProgress = getCardsInColumnBySlug(DEFAULT_BOARD_ID, "in_progress");
  return inProgress.length > 0 ? inProgress[0] : null;
}

export async function runKanbanSchedulerOnce(): Promise<{
  ran: boolean;
  cardId?: string;
  runId?: string;
  error?: string;
}> {
  if (agentBusy) {
    return { ran: false, error: "Scheduler already running" };
  }

  const card = pickNextCard();
  if (!card) {
    return { ran: false, error: "No card in todo or in_progress" };
  }

  const board = getBoard(DEFAULT_BOARD_ID);
  if (!board) return { ran: false, error: "Board not found" };

  const inProgressCol = getColumnBySlug(DEFAULT_BOARD_ID, "in_progress");
  const toTestCol = getColumnBySlug(DEFAULT_BOARD_ID, COLUMN_AFTER_SUCCESS);
  if (!inProgressCol || !toTestCol) {
    return { ran: false, error: "Missing in_progress or to_test column" };
  }

  agentBusy = true;
  currentCardId = card.id;
  const runId = crypto.randomUUID();
  currentRunId = runId;
  const start = Date.now();
  const maxSteps = getMaxSteps();
  const timeoutMs = getTimeoutMs();
  const usePiAgent = process.env.AGENT_USE_PI_AGENT === "1";

  // Move card to in progress if it was in todo
  const todoCol = getColumnBySlug(DEFAULT_BOARD_ID, "todo");
  const wasInTodo = todoCol && card.column_id === todoCol.id;
  if (wasInTodo) {
    updateCard(card.id, { column_id: inProgressCol.id });
  }

  const task = card.description?.trim()
    ? `${card.title}\n\n${card.description}`
    : card.title;

  const projectPath = board.project_path?.trim() || undefined;
  const loopOptions = {
    maxSteps,
    timeoutMs,
    mode: "Agent" as const,
    ...(projectPath
      ? { workspaceSubpath: projectPath, focusPaths: [projectPath.replace(/\/+$/, "") + "/"] }
      : {}),
  };

  try {
    logger.info("Kanban scheduler: running agent", {
      cardId: card.id,
      runId,
      taskPreview: task.slice(0, 80),
      projectPath: projectPath ?? "(none)",
    });

    const result = usePiAgent
      ? await runAgentLoopWithPiAgent(task, loopOptions)
      : await runAgentLoop(task, loopOptions);

    const durationMs = Date.now() - start;
    recordRun({
      id: runId,
      taskPreview: card.title.slice(0, 120),
      goalType: "generic",
      mode: "Agent",
      steps: result.steps,
      durationMs,
      finished: result.finished,
      cancelled: result.cancelled ?? false,
      task,
      answer: result.answer ?? null,
    });

    updateCard(card.id, { column_id: toTestCol.id, run_id: runId });
    logger.info("Kanban scheduler: run finished", {
      cardId: card.id,
      runId,
      steps: result.steps,
      finished: result.finished,
    });

    return { ran: true, cardId: card.id, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof TaskTimeoutError;
    recordRun({
      id: runId,
      taskPreview: card.title.slice(0, 120),
      goalType: "generic",
      mode: "Agent",
      steps: 0,
      durationMs: Date.now() - start,
      finished: false,
      cancelled: false,
      error: message,
    });
    if (wasInTodo && inProgressCol) {
      updateCard(card.id, { column_id: todoCol!.id });
    }
    logger.error("Kanban scheduler: run failed", {
      cardId: card.id,
      runId,
      error: message,
      timeout: isTimeout,
    });
    return { ran: true, cardId: card.id, runId, error: message };
  } finally {
    agentBusy = false;
    currentCardId = null;
    currentRunId = null;
  }
}

function tick(): void {
  runKanbanSchedulerOnce().catch((err) => {
    logger.error("Kanban scheduler tick error", { error: err instanceof Error ? err.message : String(err) });
  });
}

export function startKanbanScheduler(): void {
  if (schedulerTimer !== null) {
    logger.warn("Kanban scheduler already started");
    return;
  }
  const intervalMs = getIntervalMs();
  logger.info("Kanban scheduler started", { intervalMs });
  tick();
  schedulerTimer = setInterval(tick, intervalMs);
}

export function stopKanbanScheduler(): void {
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info("Kanban scheduler stopped");
  }
}
