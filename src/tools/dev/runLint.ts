import { runWorkspaceCommand, type CommandResult } from "../../runtime/commandExecutor.js";
import { DEFAULT_TIMEOUT_MS } from "./constants.js";

export type RunLintResult = CommandResult;

export async function runLintTool(
  options?: { cwd?: string },
): Promise<RunLintResult> {
  return runWorkspaceCommand("npm run lint", {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    cwd: options?.cwd,
  });
}
