import { runWorkspaceCommand, type CommandResult } from "../../runtime/commandExecutor.js";
import { DEFAULT_TIMEOUT_MS } from "./constants.js";

export type GitDiffResult = CommandResult;

export async function gitDiffTool(
  options?: { path?: string; staged?: boolean },
): Promise<GitDiffResult> {
  const args = options?.staged ? ["--staged"] : [];
  if (options?.path) args.push("--", options.path);
  const cmd = "git diff " + args.join(" ");
  return runWorkspaceCommand(cmd, { timeoutMs: DEFAULT_TIMEOUT_MS });
}
