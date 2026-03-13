export type ToolName =
  | "searchCode"
  | "searchSymbols"
  | "readFile"
  | "readFiles"
  | "writeFile"
  | "editLines"
  | "mkdir"
  | "touch"
  | "searchReplace"
  | "appendFile"
  | "deleteFile"
  | "deleteFiles"
  | "deleteFolder"
  | "deletePath"
  | "moveFile"
  | "copyFile"
  | "listFiles"
  | "grep"
  | "findFiles"
  | "fileExists"
  | "wc"
  | "referencedBy"
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
