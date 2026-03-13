export type RunMode = "Agent" | "Plan" | "Ask";

export type GoalType = "generic" | "runTestsAndFix" | "addEndpoint" | "improveTypes";

export interface MetricsSnapshot {
  lastRun: {
    steps: number;
    durationMs: number;
    finished: boolean;
    cancelled?: boolean;
    timestamp: string;
  } | null;
  totalRuns: number;
  totalErrors: number;
  recentRunsCount: number;
}

export type StepEventType =
  | "step"
  | "planner_delta"
  | "started"
  | "done"
  | "error"
  | "cancelled";

export interface StepEvent {
  type: StepEventType;
  step?: number;
  tool?: string;
  params?: unknown;
  error?: string;
  delta?: string;
}

export interface AgentRun {
  id: string;
  task: string;
  mode: RunMode;
  goalType?: GoalType;
  maxSteps: number;
  verbose: boolean;
  dryRun: boolean;
  createdAt: string;
  status: "running" | "finished" | "error" | "cancelled";
  steps: StepEvent[];
  answer?: string;
  errorMessage?: string;
}

export interface ServerRunRecord {
  id?: string;
  taskPreview?: string;
  goalType?: string;
  mode?: string;
  steps: number;
  durationMs: number;
  finished: boolean;
  cancelled?: boolean;
  timestamp: string;
  error?: string;
}

