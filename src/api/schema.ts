import type { AgentRunResult } from "../agent/agentLoop.js";

export interface TaskRequestBody {
  task: string;
  maxSteps?: number;
}

// Re-export AgentRunResult to make the HTTP contract explicit.
export type TaskResponseBody = AgentRunResult;

