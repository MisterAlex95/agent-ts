import {
  runWorkspaceCommand,
  type CommandResult,
} from "../runtime/commandExecutor.js";

export type GitStatusResult = CommandResult;
export type GitDiffResult = CommandResult;
export type GitLogResult = CommandResult;
export type GitCommitResult = CommandResult;
export type RunTestsResult = CommandResult;
export type RunLintResult = CommandResult;
export type RunBuildResult = CommandResult;

const DEFAULT_TIMEOUT_MS = 60_000;
const TESTS_TIMEOUT_MS = 120_000;

export async function gitStatusTool(): Promise<GitStatusResult> {
  return runWorkspaceCommand("git status --short");
}

export async function gitDiffTool(
  options?: { path?: string; staged?: boolean },
): Promise<GitDiffResult> {
  const args = options?.staged ? ["--staged"] : [];
  if (options?.path) args.push("--", options.path);
  const cmd = "git diff " + args.join(" ");
  return runWorkspaceCommand(cmd, { timeoutMs: DEFAULT_TIMEOUT_MS });
}

export async function gitLogTool(
  options?: { maxCount?: number; path?: string },
): Promise<GitLogResult> {
  const args = ["git log"];
  if (options?.maxCount) args.push(`-n ${options.maxCount}`);
  if (options?.path) args.push("--", options.path);
  const cmd = args.join(" ");
  return runWorkspaceCommand(cmd, { timeoutMs: DEFAULT_TIMEOUT_MS });
}

export async function gitCommitTool(message: string): Promise<GitCommitResult> {
  const escaped = message.replace(/"/g, '\\"');
  return runWorkspaceCommand(`git commit -m "${escaped}"`, {
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}

export async function runTestsTool(
  options?: { timeoutMs?: number },
): Promise<RunTestsResult> {
  // --run makes Vitest (and similar runners) exit after one run instead of watch mode
  return runWorkspaceCommand("npm test -- --run", {
    timeoutMs: options?.timeoutMs ?? TESTS_TIMEOUT_MS,
  });
}

export async function runLintTool(): Promise<RunLintResult> {
  return runWorkspaceCommand("npm run lint", {
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}

export async function runBuildTool(): Promise<RunBuildResult> {
  return runWorkspaceCommand("npm run build", {
    timeoutMs: DEFAULT_TIMEOUT_MS * 2,
  });
}
