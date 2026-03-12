import { searchCodeTool, searchSymbolsTool } from "../tools/searchTools.js";
import {
  readFileTool,
  writeFileTool,
  listFilesTool,
  editLinesTool,
  deleteFileTool,
  moveFileTool,
  copyFileTool,
  grepTool,
  findFilesTool,
  fileExistsTool,
} from "../tools/fileTools.js";
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
import type { RunMode } from "../api/schema.js";
import { READ_ONLY_TOOLS } from "./planner.js";

export type ToolExecutionResult = unknown;

export interface ExecuteToolOptions {
  dryRun?: boolean;
  mode?: RunMode;
}

const DRY_RUN_TOOLS: ToolName[] = [
  "writeFile",
  "editLines",
  "deleteFile",
  "moveFile",
  "copyFile",
  "runCommand",
  "gitCommit",
];

function isDryRunOnly(tool: ToolName): boolean {
  return DRY_RUN_TOOLS.includes(tool);
}

export async function executeTool(
  tool: ToolName,
  params: unknown,
  options?: ExecuteToolOptions,
): Promise<ToolExecutionResult> {
  if (options?.mode === "Ask" && !READ_ONLY_TOOLS.includes(tool)) {
    throw new Error(`Ask mode: tool "${tool}" is not allowed (read-only only)`);
  }
  const dryRun = options?.dryRun ?? false;
  if (dryRun && isDryRunOnly(tool)) {
    return {
      dryRun: true,
      planned: { tool, params },
      message: `[dry run] Would have executed ${tool}`,
    };
  }

  switch (tool) {
    case "searchCode": {
      const { query } = params as { query: string };
      return searchCodeTool(query);
    }
    case "searchSymbols": {
      const { query } = params as { query: string };
      return searchSymbolsTool(query);
    }
    case "readFile": {
      const { path } = params as { path: string };
      return readFileTool(path);
    }
    case "writeFile": {
      const { path, content } = params as { path: string; content: string };
      return writeFileTool(path, content);
    }
    case "editLines": {
      const { path, edits } = params as { path: string; edits: Array<{ line: number; content: string; mode?: string }> };
      const normalized = Array.isArray(edits)
        ? edits.map((e) => ({
            line: Number(e?.line) || 1,
            content: typeof e?.content === "string" ? e.content : "",
            mode: e?.mode === "insert" ? "insert" as const : "replace" as const,
          }))
        : [];
      return editLinesTool(path, normalized);
    }
    case "deleteFile": {
      const { path } = params as { path: string };
      return deleteFileTool(path);
    }
    case "moveFile": {
      const { from, to } = params as { from: string; to: string };
      return moveFileTool(from, to);
    }
    case "copyFile": {
      const { from, to } = params as { from: string; to: string };
      return copyFileTool(from, to);
    }
    case "listFiles": {
      const { path } = params as { path: string };
      return listFilesTool(path);
    }
    case "grep": {
      const { path, pattern, caseInsensitive, maxMatches } = params as {
        path?: string;
        pattern: string;
        caseInsensitive?: boolean;
        maxMatches?: number;
      };
      return grepTool(path ?? ".", pattern, {
        caseInsensitive: Boolean(caseInsensitive),
        maxMatches: typeof maxMatches === "number" ? maxMatches : undefined,
      });
    }
    case "findFiles": {
      const { path, namePattern } = params as { path?: string; namePattern: string };
      return findFilesTool(path ?? ".", namePattern ?? "*");
    }
    case "fileExists": {
      const { path } = params as { path: string };
      return fileExistsTool(path);
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

