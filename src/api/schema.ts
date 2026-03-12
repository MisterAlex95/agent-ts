import type { AgentRunResult } from "../agent/agentLoop.js";

export type GoalType =
  | "generic"
  | "runTestsAndFix"
  | "addEndpoint"
  | "improveTypes";

export interface TaskRequestBody {
  task: string;
  maxSteps?: number;
  goalType?: GoalType;
  verbose?: boolean;
}

// Re-export AgentRunResult to make the HTTP contract explicit.
export type TaskResponseBody = AgentRunResult;

