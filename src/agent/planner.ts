import { ollamaChat } from "../llm/ollamaClient.js";
import type { ToolName } from "./memory.js";
import type { RunMode } from "../api/schema.js";
import {
  getPlannerSystemPrompt,
  getPlannerUserPrompt,
  getPlannerAskModePrompt,
  PLANNER_RETRY_PROMPT,
  PLANNER_FALLBACK_PROMPT,
} from "../prompts/planner.js";

export interface PlannedAction {
  tool: ToolName;
  description: string;
  params: unknown;
}

export interface PlanningContext {
  task: string;
  recentObservations: string;
  relevantContext: string;
  goalType: "generic" | "runTestsAndFix" | "addEndpoint" | "improveTypes";
  mode?: RunMode;
  conversationHistory?: string;
}

export const READ_ONLY_TOOLS: ToolName[] = [
  "searchCode",
  "searchSymbols",
  "listFiles",
  "readFile",
  "grep",
  "findFiles",
  "fileExists",
  "wc",
  "referencedBy",
  "gitStatus",
  "gitDiff",
  "gitLog",
];

const TOOLS: Record<string, { params: string }> = {
  searchCode: { params: "query: string (general code context)" },
  searchSymbols: { params: "query: string (function/class/endpoint name or purpose)" },
  listFiles: { params: "path: string (e.g. \".\" or \"src\")" },
  readFile: { params: "path: string (relative path)" },
  writeFile: { params: "path: string, content: string (code must be indented, multiple lines)" },
  editLines: { params: "path: string, edits: [{ line: number, content: string, mode?: \"replace\"|\"insert\" }] (1-based; content must be indented, multiple lines)" },
  deleteFile: { params: "path: string (single file only; for directories use deleteFolder)" },
  deleteFiles: { params: "paths: string[] (file paths only; for directories use deleteFolder)" },
  deleteFolder: { params: "path: string (directory path; deletes it and contents recursively)" },
  deletePath: { params: "path: string (file or directory; deletes recursively if directory)" },
  moveFile: { params: "from: string, to: string (relative paths)" },
  copyFile: { params: "from: string, to: string (relative paths)" },
  grep: { params: "path?: string (dir or file), pattern: string (regex), caseInsensitive?: boolean, maxMatches?: number" },
  findFiles: { params: "path?: string (dir), namePattern: string (e.g. \"*.ts\", \"*.test.ts\")" },
  fileExists: { params: "path: string (relative path)" },
  wc: { params: "path: string (file path; returns lines, words, bytes)" },
  referencedBy: { params: "path: string (file path; returns which files reference it, e.g. imports)" },
  runCommand: { params: "command: string, cwd?: string (optional subdir to run in, e.g. \"react-ts\")" },
  gitStatus: { params: "none" },
  gitDiff: { params: "path?: string, staged?: boolean" },
  gitLog: { params: "maxCount?: number, path?: string" },
  gitCommit: { params: "message: string" },
  runTests: { params: "none" },
  runLint: { params: "none" },
  runBuild: { params: "none" },
  DONE: { params: "none" },
};

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : trimmed;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const fallback = raw.match(/\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:\s*\{[^}]*\}\s*\}/);
    if (fallback) {
      try {
        return JSON.parse(fallback[0]) as unknown;
      } catch {
        // try to fix common issues: trailing comma, single quotes
        const fixed = fallback[0]
          .replace(/,(\s*[}\]])/g, "$1")
          .replace(/'/g, '"');
        try {
          return JSON.parse(fixed) as unknown;
        } catch {
          return null;
        }
      }
    }
    const toolMatch = raw.match(/\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"params"\s*:\s*\{/);
    if (toolMatch) {
      const paramsStart = raw.indexOf('"params":', raw.indexOf(toolMatch[0]));
      const braceStart = raw.indexOf("{", paramsStart + 1);
      if (braceStart !== -1) {
        let depth = 1;
        let i = braceStart + 1;
        while (i < raw.length && depth > 0) {
          if (raw[i] === "{") depth++;
          else if (raw[i] === "}") depth--;
          i++;
        }
        const paramsStr = raw.slice(braceStart, i);
        try {
          const params = JSON.parse(paramsStr) as unknown;
          return { tool: toolMatch[1], params } as unknown;
        } catch {
          return { tool: toolMatch[1], params: {} } as unknown;
        }
      }
    }
    return null;
  }
}

function parsePlannedAction(
  data: unknown,
  allowedTools?: ToolName[],
): PlannedAction | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const tool = obj.tool;
  if (typeof tool !== "string") return null;

  if (tool === "DONE") return null;

  const validTools: ToolName[] =
    allowedTools ??
    ([
      "searchCode",
      "searchSymbols",
      "listFiles",
      "readFile",
      "writeFile",
      "editLines",
      "deleteFile",
      "deleteFiles",
      "deleteFolder",
      "deletePath",
      "moveFile",
      "copyFile",
      "grep",
      "findFiles",
      "fileExists",
      "wc",
      "referencedBy",
      "runCommand",
      "gitStatus",
      "gitDiff",
      "gitLog",
      "gitCommit",
      "runTests",
      "runLint",
      "runBuild",
    ] as ToolName[]);
  if (!validTools.includes(tool as ToolName)) return null;

  const params = obj.params;
  if (params !== undefined && typeof params !== "object") return null;

  const paramsObj =
    params && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {};

  const normalized: Record<string, unknown> = {};
  switch (tool) {
    case "searchCode":
    case "searchSymbols":
      normalized.query =
        typeof paramsObj.query === "string" ? paramsObj.query : "";
      break;
    case "listFiles":
    case "readFile":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : ".";
      break;
    case "writeFile":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : "";
      normalized.content =
        typeof paramsObj.content === "string" ? paramsObj.content : "";
      break;
    case "editLines":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : "";
      if (Array.isArray(paramsObj.edits)) {
        normalized.edits = paramsObj.edits
          .filter((e: unknown) => e && typeof e === "object" && "line" in e)
          .map((e: Record<string, unknown>) => ({
            line: typeof e.line === "number" ? e.line : Number(e.line) || 1,
            content: typeof e.content === "string" ? e.content : "",
            mode: e.mode === "insert" ? "insert" : "replace",
          }));
      } else {
        normalized.edits = [];
      }
      break;
    case "deleteFile":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : "";
      break;
    case "deleteFiles":
      normalized.paths = Array.isArray(paramsObj.paths)
        ? (paramsObj.paths as unknown[]).filter((p): p is string => typeof p === "string")
        : [];
      break;
    case "deleteFolder":
    case "deletePath":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : "";
      break;
    case "moveFile":
    case "copyFile":
      normalized.from =
        typeof paramsObj.from === "string" ? paramsObj.from : "";
      normalized.to =
        typeof paramsObj.to === "string" ? paramsObj.to : "";
      break;
    case "grep":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : ".";
      normalized.pattern =
        typeof paramsObj.pattern === "string" ? paramsObj.pattern : "";
      normalized.caseInsensitive = Boolean(paramsObj.caseInsensitive);
      if (typeof paramsObj.maxMatches === "number")
        normalized.maxMatches = paramsObj.maxMatches;
      break;
    case "findFiles":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : ".";
      normalized.namePattern =
        typeof paramsObj.namePattern === "string" ? paramsObj.namePattern : "*";
      break;
    case "fileExists":
    case "wc":
    case "referencedBy":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : "";
      break;
    case "runCommand":
      normalized.command =
        typeof paramsObj.command === "string" ? paramsObj.command : "";
      if (typeof paramsObj.cwd === "string") normalized.cwd = paramsObj.cwd;
      break;
    case "gitStatus":
    case "runTests":
    case "runLint":
    case "runBuild":
      break;
    case "gitDiff":
      if (typeof paramsObj.path === "string") normalized.path = paramsObj.path;
      normalized.staged = Boolean(paramsObj.staged);
      break;
    case "gitLog":
      if (typeof paramsObj.maxCount === "number")
        normalized.maxCount = paramsObj.maxCount;
      if (typeof paramsObj.path === "string") normalized.path = paramsObj.path;
      break;
    case "gitCommit":
      normalized.message =
        typeof paramsObj.message === "string" ? paramsObj.message : "";
      break;
    default:
      return null;
  }

  return {
    tool: tool as ToolName,
    description: `Execute ${tool}`,
    params: normalized,
  };
}

export async function planNextAction(
  ctx: PlanningContext,
): Promise<PlannedAction | null> {
  const isAsk = ctx.mode === "Ask";
  const allowedTools: ToolName[] = isAsk
    ? READ_ONLY_TOOLS
    : ([
        "searchCode",
        "searchSymbols",
        "listFiles",
        "readFile",
        "writeFile",
        "editLines",
        "deleteFile",
        "deleteFiles",
        "deleteFolder",
        "deletePath",
        "moveFile",
        "copyFile",
        "grep",
        "findFiles",
        "fileExists",
        "wc",
        "referencedBy",
        "runCommand",
        "gitStatus",
        "gitDiff",
        "gitLog",
        "gitCommit",
        "runTests",
        "runLint",
        "runBuild",
      ] as ToolName[]);

  const toolsList = Object.entries(TOOLS)
    .filter(([name]) => name === "DONE" || allowedTools.includes(name as ToolName))
    .map(([name, { params }]) => `- ${name}: ${params}`)
    .join("\n");

  const systemPrompt = isAsk
    ? getPlannerAskModePrompt(toolsList)
    : getPlannerSystemPrompt(toolsList);
  const userPrompt = getPlannerUserPrompt(ctx);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { content } = await ollamaChat(messages, { temperature: 0.1 });
      const data = extractJson(content);
      const parsed = parsePlannedAction(data, allowedTools);
      if (parsed) return parsed;
      if (attempt === 0) {
        messages.push({
          role: "assistant",
          content: typeof content === "string" ? content.slice(0, 500) : "",
        });
        messages.push({ role: "user", content: PLANNER_RETRY_PROMPT });
      }
    } catch {
      if (attempt === 1) return null;
      messages.push({ role: "user", content: PLANNER_FALLBACK_PROMPT });
    }
  }
  return null;
}
