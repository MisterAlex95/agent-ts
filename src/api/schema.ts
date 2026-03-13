import type { AgentRunResult } from "../agent/index.js";

export type GoalType =
  | "generic"
  | "runTestsAndFix"
  | "addEndpoint"
  | "improveTypes";

export type RunMode = "Agent" | "Plan" | "Ask";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TaskRequestBody {
  task: string;
  maxSteps?: number;
  goalType?: GoalType;
  mode?: RunMode;
  verbose?: boolean;
  dryRun?: boolean;
  timeoutMs?: number;
  /** Last N messages for context (user + assistant). Capped server-side. */
  history?: ConversationMessage[];
}

// Re-export AgentRunResult to make the HTTP contract explicit.
export type TaskResponseBody = AgentRunResult;

