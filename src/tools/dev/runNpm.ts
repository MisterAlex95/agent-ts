import { runWorkspaceCommand, type CommandResult } from "../../runtime/commandExecutor.js";
import { DEFAULT_TIMEOUT_MS } from "./constants.js";

export type RunNpmResult = CommandResult;

export interface RunNpmOptions {
  cwd?: string;
  timeoutMs?: number;
}

/**
 * Run a generic npm command in the workspace (e.g. "run build", "run lint", "test -- --run").
 * The full command executed is: npm <args>
 */
export async function runNpmTool(
  args: string,
  options?: RunNpmOptions,
): Promise<RunNpmResult> {
  const command = `npm ${(args ?? "").trim()}`.trim();
  if (command === "npm") {
    return {
      command: "npm",
      cwd: "",
      stdout: "",
      stderr: "runNpm requires args (e.g. \"run build\", \"run lint\", \"test -- --run\")",
      exitCode: -1,
      durationMs: 0,
      skipped: true,
    };
  }
  return runWorkspaceCommand(command, {
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS * 2,
    cwd: options?.cwd,
  });
}
