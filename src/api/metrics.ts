/**
 * In-memory metrics for the last run (and optional aggregate).
 * Used by GET /metrics for observability.
 */
export interface RunMetrics {
  steps: number;
  durationMs: number;
  finished: boolean;
  cancelled?: boolean;
  timestamp: string;
}

let lastRun: RunMetrics | null = null;
let totalRuns = 0;

export function recordRun(metrics: {
  steps: number;
  durationMs: number;
  finished: boolean;
  cancelled?: boolean;
}): void {
  totalRuns += 1;
  lastRun = {
    ...metrics,
    timestamp: new Date().toISOString(),
  };
}

export function getMetrics(): {
  lastRun: RunMetrics | null;
  totalRuns: number;
} {
  return {
    lastRun: lastRun ? { ...lastRun } : null,
    totalRuns,
  };
}
