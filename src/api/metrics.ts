/**
 * Run metrics and recent run history, persisted in SQLite.
 * Used by GET /metrics and GET /runs for observability.
 */
import {
  insertRun as dbInsertRun,
  getRecentRunsFromDb,
  getMetricsFromDb,
  type RunRow,
} from "./db.js";

export function runRowToRecord(row: RunRow): RunRecord {
  return rowToRecord(row);
}

export interface RunMetrics {
  steps: number;
  durationMs: number;
  finished: boolean;
  cancelled?: boolean;
  timestamp: string;
}

export interface RunRecord extends RunMetrics {
  id?: string;
  taskPreview?: string;
  goalType?: string;
  mode?: string;
  error?: string;
  task?: string;
  answer?: string | null;
}

function rowToRecord(row: RunRow): RunRecord {
  return {
    id: row.id ?? undefined,
    taskPreview: row.task_preview ?? undefined,
    goalType: row.goal_type ?? undefined,
    mode: row.mode ?? undefined,
    steps: row.steps,
    durationMs: row.duration_ms,
    finished: Boolean(row.finished),
    cancelled: row.cancelled ? true : undefined,
    error: row.error ?? undefined,
    timestamp: row.timestamp,
    task: row.task ?? undefined,
    answer: row.answer ?? undefined,
  };
}

function rowToMetrics(row: RunRow): RunMetrics {
  return {
    steps: row.steps,
    durationMs: row.duration_ms,
    finished: Boolean(row.finished),
    cancelled: row.cancelled ? true : undefined,
    timestamp: row.timestamp,
  };
}

export function recordRun(metrics: {
  steps: number;
  durationMs: number;
  finished: boolean;
  cancelled?: boolean;
  id?: string;
  taskPreview?: string;
  goalType?: string;
  mode?: string;
  error?: string;
  task?: string;
  answer?: string | null;
}): void {
  dbInsertRun({
    id: metrics.id,
    taskPreview: metrics.taskPreview,
    goalType: metrics.goalType,
    mode: metrics.mode,
    steps: metrics.steps,
    durationMs: metrics.durationMs,
    finished: metrics.finished,
    cancelled: metrics.cancelled,
    error: metrics.error,
    task: metrics.task,
    answer: metrics.answer,
  });
}

export function getMetrics(): {
  lastRun: RunMetrics | null;
  totalRuns: number;
  totalErrors: number;
  recentRunsCount: number;
} {
  const fromDb = getMetricsFromDb();
  return {
    lastRun: fromDb.lastRun ? rowToMetrics(fromDb.lastRun) : null,
    totalRuns: fromDb.totalRuns,
    totalErrors: fromDb.totalErrors,
    recentRunsCount: fromDb.recentRunsCount,
  };
}

const RECENT_LIMIT = 50;

export function getRecentRuns(limit = 20): RunRecord[] {
  if (limit <= 0) return [];
  const rows = getRecentRunsFromDb(Math.min(limit, RECENT_LIMIT));
  return rows.map(rowToRecord);
}
