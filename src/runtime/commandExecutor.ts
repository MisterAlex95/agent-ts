import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { getWorkspaceRoot } from "./workspaceManager.js";

const execAsync = promisify(exec);

export interface CommandResult {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  skipped?: boolean;
}

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  allowDangerous?: boolean;
}

const SAFE_COMMAND_PREFIXES = [
  "npm ",
  "pnpm ",
  "yarn ",
  "git ",
  "node ",
  "npx ",
  "ls",
  "pwd",
  "echo ",
];

function isSafeCommand(command: string): boolean {
  const trimmed = command.trim();
  return SAFE_COMMAND_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export async function runWorkspaceCommand(
  command: string,
  options?: RunCommandOptions,
): Promise<CommandResult> {
  const root = getWorkspaceRoot();
  const cwd = options?.cwd
    ? path.resolve(root, options.cwd)
    : path.resolve(root);

  if (!options?.allowDangerous && !isSafeCommand(command)) {
    return {
      command,
      cwd,
      stdout: "",
      stderr:
        "Command rejected by whitelist. Allowed prefixes: " +
        SAFE_COMMAND_PREFIXES.join(", "),
      exitCode: -1,
      durationMs: 0,
      skipped: true,
    };
  }

  const started = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: options?.timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return {
      command,
      cwd,
      stdout,
      stderr,
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const error = err as Error & {
      stdout?: string;
      stderr?: string;
      code?: number;
      killed?: boolean;
      signal?: NodeJS.Signals;
    };
    const baseMessage = error.stderr ?? error.message;
    const extra =
      error.killed && options?.timeoutMs
        ? ` (killed after timeout ${options.timeoutMs} ms)`
        : "";
    return {
      command,
      cwd,
      stdout: error.stdout ?? "",
      stderr: baseMessage + extra,
      exitCode: typeof error.code === "number" ? error.code : 1,
      durationMs: Date.now() - started,
    };
  }
}

