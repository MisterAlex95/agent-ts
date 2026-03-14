/**
 * TypeBox tool definitions for pi-ai native tool calling.
 * Single source of schemas; execution is delegated to actionResolver via executePiToolCall.
 */
import { Type, type Tool } from "@mariozechner/pi-ai";
import type { ToolName } from "../agent/memory/index.js";
import type { RunMode } from "../api/schema.js";
import { executeTool } from "../agent/execution/actionResolver.js";
import type { ExecuteToolOptions } from "../agent/execution/actionResolver.js";
import { READ_ONLY_TOOLS, EXECUTABLE_TOOL_NAMES } from "./registry/index.js";

const editItemSchema = Type.Object({
  line: Type.Number(),
  content: Type.String(),
  mode: Type.Optional(Type.Union([Type.Literal("replace"), Type.Literal("insert")])),
});

const PI_TOOLS: Tool[] = [
  {
    name: "searchCode",
    description: "Search codebase for general code context",
    parameters: Type.Object({ query: Type.String() }),
  },
  {
    name: "searchSymbols",
    description: "Search for function/class/endpoint name or purpose",
    parameters: Type.Object({ query: Type.String() }),
  },
  {
    name: "listFiles",
    description: "List files in a directory (e.g. . or src)",
    parameters: Type.Object({ path: Type.Optional(Type.String()) }),
  },
  {
    name: "readFile",
    description: "Read a file by relative path",
    parameters: Type.Object({ path: Type.Optional(Type.String()) }),
  },
  {
    name: "readFiles",
    description: "Read multiple files in one call",
    parameters: Type.Object({ paths: Type.Array(Type.String()) }),
  },
  {
    name: "writeFile",
    description: "Write content to a file (code must be indented, multiple lines)",
    parameters: Type.Object({
      path: Type.String(),
      content: Type.String(),
    }),
  },
  {
    name: "editLines",
    description: "Edit specific lines (1-based); use when you have line numbers from search",
    parameters: Type.Object({
      path: Type.String(),
      edits: Type.Array(editItemSchema),
    }),
  },
  {
    name: "mkdir",
    description: "Create directory recursively",
    parameters: Type.Object({ path: Type.String() }),
  },
  {
    name: "touch",
    description: "Create file if missing or update mtime",
    parameters: Type.Object({ path: Type.String() }),
  },
  {
    name: "searchReplace",
    description: "Replace exact snippet (first occurrence only)",
    parameters: Type.Object({
      path: Type.String(),
      oldText: Type.String(),
      newText: Type.String(),
    }),
  },
  {
    name: "appendFile",
    description: "Append content at end of file",
    parameters: Type.Object({
      path: Type.String(),
      content: Type.String(),
    }),
  },
  {
    name: "deleteFile",
    description: "Delete a single file",
    parameters: Type.Object({ path: Type.String() }),
  },
  {
    name: "deleteFiles",
    description: "Delete multiple files",
    parameters: Type.Object({ paths: Type.Array(Type.String()) }),
  },
  {
    name: "deleteFolder",
    description: "Delete directory and contents recursively",
    parameters: Type.Object({ path: Type.String() }),
  },
  {
    name: "deletePath",
    description: "Delete file or directory recursively",
    parameters: Type.Object({ path: Type.String() }),
  },
  {
    name: "moveFile",
    description: "Move file (relative paths)",
    parameters: Type.Object({ from: Type.String(), to: Type.String() }),
  },
  {
    name: "copyFile",
    description: "Copy file (relative paths)",
    parameters: Type.Object({ from: Type.String(), to: Type.String() }),
  },
  {
    name: "grep",
    description: "Grep in path with regex",
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
      pattern: Type.String(),
      caseInsensitive: Type.Optional(Type.Boolean()),
      maxMatches: Type.Optional(Type.Number()),
    }),
  },
  {
    name: "findFiles",
    description: "Find files by name pattern (e.g. *.ts)",
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
      namePattern: Type.Optional(Type.String()),
    }),
  },
  {
    name: "fileExists",
    description: "Check if path exists",
    parameters: Type.Object({ path: Type.String() }),
  },
  {
    name: "wc",
    description: "Lines, words, bytes for a file",
    parameters: Type.Object({ path: Type.String() }),
  },
  {
    name: "referencedBy",
    description: "Files that reference this path (e.g. imports)",
    parameters: Type.Object({ path: Type.String() }),
  },
  {
    name: "runCommand",
    description: "Run shell command with optional cwd",
    parameters: Type.Object({
      command: Type.String(),
      cwd: Type.Optional(Type.String()),
    }),
  },
  {
    name: "gitStatus",
    description: "Git status",
    parameters: Type.Object({}),
  },
  {
    name: "gitDiff",
    description: "Git diff",
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
      staged: Type.Optional(Type.Boolean()),
    }),
  },
  {
    name: "gitLog",
    description: "Git log",
    parameters: Type.Object({
      maxCount: Type.Optional(Type.Number()),
      path: Type.Optional(Type.String()),
    }),
  },
  {
    name: "gitCommit",
    description: "Git commit",
    parameters: Type.Object({ message: Type.String() }),
  },
  {
    name: "runNpm",
    description: "Run npm (e.g. run build, run lint, test -- --run)",
    parameters: Type.Object({
      args: Type.String(),
      cwd: Type.Optional(Type.String()),
    }),
  },
];

const TOOLS_BY_NAME = new Map(PI_TOOLS.map((t) => [t.name, t]));

/**
 * Return pi-ai Tool[] for the given mode. Ask mode only includes read-only tools.
 */
export function getPiTools(mode?: RunMode): Tool[] {
  if (mode === "Ask") {
    return PI_TOOLS.filter((t) => READ_ONLY_TOOLS.includes(t.name as ToolName));
  }
  return PI_TOOLS;
}

/**
 * Normalize raw tool arguments (e.g. from pi-ai tool call) to the shape expected by executeTool.
 */
export function normalizeToolArgs(
  tool: ToolName,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const p = params ?? {};
  const normalized: Record<string, unknown> = {};

  switch (tool) {
    case "searchCode":
    case "searchSymbols":
      normalized.query = typeof p.query === "string" ? p.query : "";
      break;
    case "listFiles":
    case "readFile":
      normalized.path = typeof p.path === "string" ? p.path : ".";
      break;
    case "readFiles":
      normalized.paths = Array.isArray(p.paths)
        ? (p.paths as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      break;
    case "mkdir":
    case "touch":
      normalized.path = typeof p.path === "string" ? p.path : "";
      break;
    case "writeFile":
      normalized.path = typeof p.path === "string" ? p.path : "";
      normalized.content = typeof p.content === "string" ? p.content : "";
      break;
    case "editLines": {
      normalized.path = typeof p.path === "string" ? p.path : "";
      if (Array.isArray(p.edits)) {
        normalized.edits = (p.edits as unknown[]).map((e) => {
          const x = e as Record<string, unknown>;
          return {
            line: typeof x.line === "number" ? x.line : Number(x.line) || 1,
            content: typeof x.content === "string" ? x.content : "",
            mode: x.mode === "insert" ? ("insert" as const) : ("replace" as const),
          };
        });
      } else {
        normalized.edits = [];
      }
      break;
    }
    case "searchReplace":
      normalized.path = typeof p.path === "string" ? p.path : "";
      normalized.oldText = typeof p.oldText === "string" ? p.oldText : "";
      normalized.newText = typeof p.newText === "string" ? p.newText : "";
      break;
    case "appendFile":
      normalized.path = typeof p.path === "string" ? p.path : "";
      normalized.content = typeof p.content === "string" ? p.content : "";
      break;
    case "deleteFile":
    case "deleteFolder":
    case "deletePath":
      normalized.path = typeof p.path === "string" ? p.path : "";
      break;
    case "deleteFiles":
      normalized.paths = Array.isArray(p.paths)
        ? (p.paths as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      break;
    case "moveFile":
    case "copyFile":
      normalized.from = typeof p.from === "string" ? p.from : "";
      normalized.to = typeof p.to === "string" ? p.to : "";
      break;
    case "grep":
      normalized.path = typeof p.path === "string" ? p.path : ".";
      normalized.pattern = typeof p.pattern === "string" ? p.pattern : "";
      normalized.caseInsensitive = Boolean(p.caseInsensitive);
      if (typeof p.maxMatches === "number") normalized.maxMatches = p.maxMatches;
      break;
    case "findFiles":
      normalized.path = typeof p.path === "string" ? p.path : ".";
      normalized.namePattern = typeof p.namePattern === "string" ? p.namePattern : "*";
      break;
    case "fileExists":
    case "wc":
    case "referencedBy":
      normalized.path = typeof p.path === "string" ? p.path : "";
      break;
    case "runCommand":
      normalized.command = typeof p.command === "string" ? p.command : "";
      if (typeof p.cwd === "string") normalized.cwd = p.cwd;
      break;
    case "gitStatus":
      break;
    case "runNpm":
      normalized.args = typeof p.args === "string" ? p.args : "";
      if (typeof p.cwd === "string") normalized.cwd = p.cwd;
      break;
    case "gitDiff":
      if (typeof p.path === "string") normalized.path = p.path;
      normalized.staged = Boolean(p.staged);
      break;
    case "gitLog":
      if (typeof p.maxCount === "number") normalized.maxCount = p.maxCount;
      if (typeof p.path === "string") normalized.path = p.path;
      break;
    case "gitCommit":
      normalized.message = typeof p.message === "string" ? p.message : "";
      break;
    default:
      return normalized;
  }
  return normalized;
}

/**
 * Execute a tool call from pi-ai (name + arguments) via the existing actionResolver.
 * Use when processing native tool calls from pi-ai stream/complete.
 */
export async function executePiToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options?: ExecuteToolOptions,
): Promise<unknown> {
  if (!EXECUTABLE_TOOL_NAMES.includes(toolName as ToolName)) {
    throw new Error(`Unknown or non-executable tool: ${toolName}`);
  }
  const normalized = normalizeToolArgs(toolName as ToolName, args);
  return executeTool(toolName as ToolName, normalized, options);
}

/** All pi-ai Tool definitions (for use with stream/complete when tools are passed). */
export function getAllPiTools(): Tool[] {
  return PI_TOOLS;
}

/** Get a single Tool by name (for validation or UI). */
export function getPiToolByName(name: string): Tool | undefined {
  return TOOLS_BY_NAME.get(name);
}
