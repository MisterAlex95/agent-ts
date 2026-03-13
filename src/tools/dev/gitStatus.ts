import { runWorkspaceCommand, type CommandResult } from "../../runtime/commandExecutor.js";

export type GitStatusResult = CommandResult;

export async function gitStatusTool(): Promise<GitStatusResult> {
  return runWorkspaceCommand("git status --short");
}
