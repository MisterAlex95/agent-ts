/**
 * Agent loop public types and options.
 */
import type { AgentMemorySnapshot } from "../memory/index.js";
import type { GoalType, RunMode } from "../../api/schema.js";
import type { ConversationMessage } from "../../api/schema.js";

export interface StepEvent {
  step: number;
  tool: string;
  params: unknown;
  result?: unknown;
  error?: string;
}

export interface AgentRunOptions {
  maxSteps?: number;
  goalType?: GoalType;
  mode?: RunMode;
  verbose?: boolean;
  dryRun?: boolean;
  timeoutMs?: number;
  onStep?: (event: StepEvent) => void;
  /** Called with each planner LLM stream delta when using streaming (e.g. for /tasks/stream) */
  onPlannerChunk?: (delta: string) => void;
  history?: ConversationMessage[];
  /** When aborted, the loop returns early with cancelled: true */
  signal?: AbortSignal;
}

export interface TraceEntry {
  timestamp: string;
  tool: string;
  params?: unknown;
  error?: string;
  outputTruncated?: string;
}

export interface AgentRunResult {
  finished: boolean;
  steps: number;
  memory: AgentMemorySnapshot;
  answer: string | null;
  trace?: TraceEntry[];
  dryRunPlannedChanges?: Array<{ tool: string; params: unknown }>;
  /** True when the run was aborted via signal */
  cancelled?: boolean;
}
