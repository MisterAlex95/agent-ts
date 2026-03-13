/**
 * Single source of truth for tool names, params, read-only and dry-run flags.
 * Used by planner (prompt building) and actionResolver (validation / dry-run).
 */
import type { ToolName } from "../../agent/memory/index.js";

export interface ToolDef {
  name: ToolName | "DONE";
  params: string;
  readOnly: boolean;
  dryRunOnly: boolean;
}

const TOOL_DEFS: ToolDef[] = [
  { name: "searchCode", params: "query: string (general code context)", readOnly: true, dryRunOnly: false },
  { name: "searchSymbols", params: "query: string (function/class/endpoint name or purpose)", readOnly: true, dryRunOnly: false },
  { name: "listFiles", params: "path: string (e.g. \".\" or \"src\")", readOnly: true, dryRunOnly: false },
  { name: "readFile", params: "path: string (relative path)", readOnly: true, dryRunOnly: false },
  { name: "writeFile", params: "path: string, content: string (code must be indented, multiple lines)", readOnly: false, dryRunOnly: true },
  { name: "editLines", params: "path: string, edits: [{ line: number, content: string, mode?: \"replace\"|\"insert\" }] (1-based; use when you have line numbers from search)", readOnly: false, dryRunOnly: true },
  { name: "searchReplace", params: "path: string, oldText: string, newText: string (exact snippet to find and replace; first occurrence only)", readOnly: false, dryRunOnly: true },
  { name: "appendFile", params: "path: string, content: string (append content at end of file; no line numbers)", readOnly: false, dryRunOnly: true },
  { name: "deleteFile", params: "path: string (single file only; for directories use deleteFolder)", readOnly: false, dryRunOnly: true },
  { name: "deleteFiles", params: "paths: string[] (file paths only; for directories use deleteFolder)", readOnly: false, dryRunOnly: true },
  { name: "deleteFolder", params: "path: string (directory path; deletes it and contents recursively)", readOnly: false, dryRunOnly: true },
  { name: "deletePath", params: "path: string (file or directory; deletes recursively if directory)", readOnly: false, dryRunOnly: true },
  { name: "moveFile", params: "from: string, to: string (relative paths)", readOnly: false, dryRunOnly: true },
  { name: "copyFile", params: "from: string, to: string (relative paths)", readOnly: false, dryRunOnly: true },
  { name: "grep", params: "path?: string (dir or file), pattern: string (regex), caseInsensitive?: boolean, maxMatches?: number", readOnly: true, dryRunOnly: false },
  { name: "findFiles", params: "path?: string (dir), namePattern: string (e.g. \"*.ts\", \"*.test.ts\")", readOnly: true, dryRunOnly: false },
  { name: "fileExists", params: "path: string (relative path)", readOnly: true, dryRunOnly: false },
  { name: "wc", params: "path: string (file path; returns lines, words, bytes)", readOnly: true, dryRunOnly: false },
  { name: "referencedBy", params: "path: string (file path; returns which files reference it, e.g. imports)", readOnly: true, dryRunOnly: false },
  { name: "runCommand", params: "command: string, cwd?: string (optional subdir to run in, e.g. \"react-ts\")", readOnly: false, dryRunOnly: true },
  { name: "gitStatus", params: "none", readOnly: true, dryRunOnly: false },
  { name: "gitDiff", params: "path?: string, staged?: boolean", readOnly: true, dryRunOnly: false },
  { name: "gitLog", params: "maxCount?: number, path?: string", readOnly: true, dryRunOnly: false },
  { name: "gitCommit", params: "message: string", readOnly: false, dryRunOnly: true },
  { name: "runTests", params: "cwd?: string (optional subdir, e.g. \"react-ts\")", readOnly: false, dryRunOnly: false },
  { name: "runLint", params: "cwd?: string (optional subdir)", readOnly: false, dryRunOnly: false },
  { name: "runBuild", params: "cwd?: string (optional subdir, e.g. \"react-ts\")", readOnly: false, dryRunOnly: false },
  { name: "DONE", params: "none", readOnly: true, dryRunOnly: false },
];

export const READ_ONLY_TOOLS: ToolName[] = TOOL_DEFS.filter((t) => t.readOnly && t.name !== "DONE").map((t) => t.name as ToolName);

export const DRY_RUN_TOOLS: ToolName[] = TOOL_DEFS.filter((t) => t.dryRunOnly && t.name !== "DONE").map((t) => t.name as ToolName);

/** Record of tool name -> params for planner prompt */
export function getToolsForPlanner(includeDONE = true): Record<string, { params: string }> {
  const entries = TOOL_DEFS.filter((t) => includeDONE || t.name !== "DONE");
  return Object.fromEntries(entries.map((t) => [t.name, { params: t.params }]));
}

export function isReadOnlyTool(name: string): boolean {
  return TOOL_DEFS.some((t) => t.name === name && t.readOnly);
}

export function isDryRunOnlyTool(name: string): boolean {
  return TOOL_DEFS.some((t) => t.name === name && t.dryRunOnly);
}

/** All tool names that can be executed (excludes DONE) */
export const EXECUTABLE_TOOL_NAMES: ToolName[] = TOOL_DEFS.filter(
  (t) => t.name !== "DONE",
).map((t) => t.name as ToolName);
