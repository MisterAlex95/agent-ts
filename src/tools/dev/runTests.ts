import { runWorkspaceCommand, type CommandResult } from "../../runtime/commandExecutor.js";
import { TESTS_TIMEOUT_MS } from "./constants.js";

export type RunTestsResult = CommandResult;

export async function runTestsTool(
  options?: { timeoutMs?: number; cwd?: string },
): Promise<RunTestsResult> {
  return runWorkspaceCommand("npm test -- --run", {
    timeoutMs: options?.timeoutMs ?? TESTS_TIMEOUT_MS,
    cwd: options?.cwd,
  });
}
