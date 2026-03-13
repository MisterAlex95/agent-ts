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
  | "cancelled"
  | "answer_delta";

export interface FileChangeDisplay {
  kind: "file_change";
  filePath: string;
  diffSummary: { added: number; removed: number };
  snippet: string;
}

export interface StepEvent {
  type: StepEventType;
  step?: number;
  tool?: string;
  params?: unknown;
  /** Truncated tool output (when type is "step") */
  result?: string;
  error?: string;
  delta?: string;
  /** Set when type is "started"; use for cancel via DELETE /tasks/:id */
  taskId?: string;
  /** Optional display hint from backend (e.g. file change diff) */
  display?: FileChangeDisplay;
}

export interface TraceEntry {
  timestamp: string;
  tool: string;
  params?: unknown;
  error?: string;
  outputTruncated?: string;
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
  /** Planner thinking text accumulated before each step (index matches steps) */
  stepThoughts?: string[];
  /** Current planner stream buffer; cleared when a step is received */
  plannerStream?: string;
  answer?: string;
  errorMessage?: string;
  /** Server task id from stream "started" event; used to cancel run */
  taskId?: string;
  /** Verbose trace (tool, params, output) when verbose was true */
  trace?: TraceEntry[];
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
  task?: string;
  answer?: string | null;
}

