/**
 * Agent loop public types and options.
 */
import type { AgentMemorySnapshot } from "../memory/index.js";
import type { GoalType, RunMode } from "../../api/schema.js";
import type { ConversationMessage } from "../../api/schema.js";

export interface FileChangeDisplay {
  kind: "file_change";
  filePath: string;
  diffSummary: { added: number; removed: number };
  snippet: string;
}

export interface StepEvent {
  step: number;
  tool: string;
  params: unknown;
  result?: unknown;
  error?: string;
  /** Optional display hint for feed UI (e.g. file change diff) */
  display?: FileChangeDisplay;
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
  /** Called with each chunk of the final answer when summarizing the run (stream) */
  onAnswerChunk?: (delta: string) => void;
  history?: ConversationMessage[];
  /** When aborted, the loop returns early with cancelled: true */
  signal?: AbortSignal;
  /** Paths to prioritize for RAG and planner (e.g. focus on specific files/folders) */
  focusPaths?: string[];
  /** When set, the agent must only work under this path (e.g. "projetA" => workspace/projetA/). All file paths are prefixed and validated. */
  workspaceSubpath?: string;
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
