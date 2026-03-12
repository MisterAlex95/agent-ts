import { searchCodeTool } from "../tools/searchTools.js";
import { readFileTool, writeFileTool, listFilesTool } from "../tools/fileTools.js";
import { runCommandTool } from "../tools/commandTools.js";
import {
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitCommitTool,
  runTestsTool,
  runLintTool,
  runBuildTool,
} from "../tools/devTools.js";
import type { ToolName } from "./memory.js";

export type ToolExecutionResult = unknown;

export async function executeTool(
  tool: ToolName,
  params: unknown,
): Promise<ToolExecutionResult> {
  switch (tool) {
    case "searchCode": {
      const { query } = params as { query: string };
      return searchCodeTool(query);
    }
    case "readFile": {
      const { path } = params as { path: string };
      return readFileTool(path);
    }
    case "writeFile": {
      const { path, content } = params as { path: string; content: string };
      return writeFileTool(path, content);
    }
    case "listFiles": {
      const { path } = params as { path: string };
      return listFilesTool(path);
    }
    case "runCommand": {
      const { command } = params as { command: string };
      return runCommandTool(command);
    }
    case "gitStatus":
      return gitStatusTool();
    case "gitDiff": {
      const { path, staged } = params as { path?: string; staged?: boolean };
      return gitDiffTool({ path, staged });
    }
    case "gitLog": {
      const { maxCount, path } = params as { maxCount?: number; path?: string };
      return gitLogTool({ maxCount, path });
    }
    case "gitCommit": {
      const { message } = params as { message: string };
      return gitCommitTool(message);
    }
    case "runTests":
      return runTestsTool();
    case "runLint":
      return runLintTool();
    case "runBuild":
      return runBuildTool();
    default: {
      const neverTool: never = tool;
      throw new Error(`Unsupported tool: ${String(neverTool)}`);
    }
  }
}

