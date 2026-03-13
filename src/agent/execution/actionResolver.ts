import { searchCodeTool, searchSymbolsTool } from "../../tools/search/index.js";
import {
  readFileTool,
  readFilesTool,
  writeFileTool,
  listFilesTool,
  editLinesTool,
  mkdirTool,
  touchTool,
  searchReplaceTool,
  appendFileTool,
  deleteFileTool,
  deleteFilesTool,
  deleteFolderTool,
  deletePathTool,
  moveFileTool,
  copyFileTool,
  grepTool,
  findFilesTool,
  fileExistsTool,
  wcTool,
  referencedByTool,
} from "../../tools/file/index.js";
import { runCommandTool } from "../../tools/command/index.js";
import {
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitCommitTool,
  runTestsTool,
  runLintTool,
  runBuildTool,
} from "../../tools/dev/index.js";
import type { ToolName } from "../memory/index.js";
import type { RunMode } from "../../api/schema.js";
import { READ_ONLY_TOOLS } from "../planning/planner.js";
import { DRY_RUN_TOOLS } from "../../tools/registry/index.js";

export type ToolExecutionResult = unknown;

export interface ExecuteToolOptions {
  dryRun?: boolean;
  mode?: RunMode;
}

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
    case "readFiles": {
      const { paths } = params as { paths: string[] };
      return readFilesTool(Array.isArray(paths) ? paths : []);
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
    case "mkdir": {
      const { path } = params as { path: string };
      return mkdirTool(path ?? "");
    }
    case "touch": {
      const { path } = params as { path: string };
      return touchTool(path ?? "");
    }
    case "searchReplace": {
      const { path, oldText, newText } = params as { path: string; oldText: string; newText: string };
      return searchReplaceTool(path ?? "", oldText ?? "", newText ?? "");
    }
    case "appendFile": {
      const { path, content } = params as { path: string; content: string };
      return appendFileTool(path ?? "", content ?? "");
    }
    case "deleteFile": {
      const { path } = params as { path: string };
      return deleteFileTool(path);
    }
    case "deleteFiles": {
      const { paths } = params as { paths: string[] };
      return deleteFilesTool(Array.isArray(paths) ? paths : []);
    }
    case "deleteFolder": {
      const { path } = params as { path: string };
      return deleteFolderTool(path);
    }
    case "deletePath": {
      const { path } = params as { path: string };
      return deletePathTool(path);
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
    case "wc": {
      const { path } = params as { path: string };
      return wcTool(path);
    }
    case "referencedBy": {
      const { path } = params as { path: string };
      return referencedByTool(path);
    }
    case "runCommand": {
      const { command, cwd } = params as { command: string; cwd?: string };
      return runCommandTool(command, cwd ? { cwd } : undefined);
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
    case "runTests": {
      const { cwd } = params as { cwd?: string };
      return runTestsTool(cwd ? { cwd } : undefined);
    }
    case "runLint": {
      const { cwd } = params as { cwd?: string };
      return runLintTool(cwd ? { cwd } : undefined);
    }
    case "runBuild": {
      const { cwd } = params as { cwd?: string };
      return runBuildTool(cwd ? { cwd } : undefined);
    }
    default: {
      const neverTool: never = tool;
      throw new Error(`Unsupported tool: ${String(neverTool)}`);
    }
  }
}
