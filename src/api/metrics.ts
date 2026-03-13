/**
 * In-memory metrics and recent run history.
 * Used by GET /metrics and GET /runs for observability.
 */
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
}

let lastRun: RunMetrics | null = null;
let totalRuns = 0;
let totalErrors = 0;

const RECENT_LIMIT = 50;
const recentRuns: RunRecord[] = [];

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
}): void {
  const timestamp = new Date().toISOString();
  totalRuns += 1;

  const base: RunMetrics = {
    steps: metrics.steps,
    durationMs: metrics.durationMs,
    finished: metrics.finished,
    cancelled: metrics.cancelled,
    timestamp,
  };
  lastRun = base;

  const record: RunRecord = {
    ...base,
    id: metrics.id,
    taskPreview: metrics.taskPreview,
    goalType: metrics.goalType,
    mode: metrics.mode,
    error: metrics.error,
  };
  if (record.error) {
    totalErrors += 1;
  }
  recentRuns.unshift(record);
  if (recentRuns.length > RECENT_LIMIT) {
    recentRuns.length = RECENT_LIMIT;
  }
}

export function getMetrics(): {
  lastRun: RunMetrics | null;
  totalRuns: number;
  totalErrors: number;
  recentRunsCount: number;
} {
  return {
    lastRun: lastRun ? { ...lastRun } : null,
    totalRuns,
    totalErrors,
    recentRunsCount: recentRuns.length,
  };
}

export function getRecentRuns(limit = 20): RunRecord[] {
  if (limit <= 0) return [];
  return recentRuns.slice(0, Math.min(limit, RECENT_LIMIT)).map((r) => ({ ...r }));
}
