import { runWorkspaceCommand, type CommandResult } from "../../runtime/commandExecutor.js";
import { DEFAULT_TIMEOUT_MS } from "./constants.js";

export type RunBuildResult = CommandResult;

export async function runBuildTool(
  options?: { cwd?: string },
): Promise<RunBuildResult> {
  return runWorkspaceCommand("npm run build", {
    timeoutMs: DEFAULT_TIMEOUT_MS * 2,
    cwd: options?.cwd,
  });
}
