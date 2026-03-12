import {
  runWorkspaceCommand,
  type CommandResult,
  type RunCommandOptions,
} from "../runtime/commandExecutor.js";

export async function runCommandTool(
  command: string,
  options?: RunCommandOptions,
): Promise<CommandResult> {
  return runWorkspaceCommand(command, options);
}

