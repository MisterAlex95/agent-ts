import { runWorkspaceCommand, type CommandResult } from "../../runtime/commandExecutor.js";
import { DEFAULT_TIMEOUT_MS } from "./constants.js";

export type GitLogResult = CommandResult;

export async function gitLogTool(
  options?: { maxCount?: number; path?: string },
): Promise<GitLogResult> {
  const args = ["git log"];
  if (options?.maxCount) args.push(`-n ${options.maxCount}`);
  if (options?.path) args.push("--", options.path);
  const cmd = args.join(" ");
  return runWorkspaceCommand(cmd, { timeoutMs: DEFAULT_TIMEOUT_MS });
}
