export type ToolName =
  | "searchCode"
  | "readFile"
  | "writeFile"
  | "listFiles"
  | "runCommand"
  | "gitStatus"
  | "gitDiff"
  | "gitLog"
  | "gitCommit"
  | "runTests"
  | "runLint"
  | "runBuild";

export interface ToolObservation {
  tool: ToolName;
  input: unknown;
  output: unknown;
  timestamp: string;
}

export interface AgentMemorySnapshot {
  task: string;
  actions: ToolObservation[];
}

export class AgentMemory {
  private readonly task: string;
  private readonly actions: ToolObservation[] = [];

  constructor(task: string) {
    this.task = task;
  }

  recordObservation(observation: Omit<ToolObservation, "timestamp">): void {
    this.actions.push({
      ...observation,
      timestamp: new Date().toISOString(),
    });
  }

  snapshot(): AgentMemorySnapshot {
    return {
      task: this.task,
      actions: [...this.actions],
    };
  }
}

