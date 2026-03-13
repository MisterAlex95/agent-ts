import { runWorkspaceCommand, type CommandResult } from "../../runtime/commandExecutor.js";
import { DEFAULT_TIMEOUT_MS } from "./constants.js";

export type GitCommitResult = CommandResult;

export async function gitCommitTool(message: string): Promise<GitCommitResult> {
  const escaped = message.replace(/"/g, '\\"');
  return runWorkspaceCommand(`git commit -m "${escaped}"`, {
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}
