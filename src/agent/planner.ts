import { ollamaChat } from "../llm/ollamaClient.js";
import type { ToolName } from "./memory.js";

export interface PlannedAction {
  tool: ToolName;
  description: string;
  params: unknown;
}

export interface PlanningContext {
  task: string;
  recentObservations: string;
  relevantContext: string;
}

const TOOLS: Record<string, { params: string }> = {
  searchCode: { params: "query: string" },
  listFiles: { params: "path: string (e.g. \".\" or \"src\")" },
  readFile: { params: "path: string (relative path)" },
  writeFile: { params: "path: string, content: string" },
  runCommand: { params: "command: string" },
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
  return JSON.parse(raw) as unknown;
}

function parsePlannedAction(data: unknown): PlannedAction | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const tool = obj.tool;
  if (typeof tool !== "string") return null;

  if (tool === "DONE") return null;

  const validTools: ToolName[] = [
    "searchCode",
    "listFiles",
    "readFile",
    "writeFile",
    "runCommand",
    "gitStatus",
    "gitDiff",
    "gitLog",
    "gitCommit",
    "runTests",
    "runLint",
    "runBuild",
  ];
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
    case "runCommand":
      normalized.command =
        typeof paramsObj.command === "string" ? paramsObj.command : "";
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
  const systemPrompt = `You are a coding agent. Given a user task and the results of previous tool calls, you must choose the NEXT single tool to run, or respond with DONE if the task is complete or no further action is useful.

Available tools and their params (respond with JSON only):
${Object.entries(TOOLS)
  .map(([name, { params }]) => `- ${name}: ${params}`)
  .join("\n")}

Respond with exactly one JSON object, no other text. Examples:
{"tool":"searchCode","params":{"query":"where is the main entry point"}}
{"tool":"listFiles","params":{"path":"."}}
{"tool":"readFile","params":{"path":"src/index.ts"}}
{"tool":"DONE","params":{}}
`;

  const userPrompt = `Task: ${ctx.task}

Relevant code context (from semantic search):
${ctx.relevantContext || "(none yet)"}

Previous tool results (most recent first):
${ctx.recentObservations || "(none yet)"}

What is the next tool to run? Reply with a single JSON object: {"tool":"...","params":{...}} or {"tool":"DONE","params":{}}.`;

  try {
    const { content } = await ollamaChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.1 },
    );

    const data = extractJson(content);
    return parsePlannedAction(data);
  } catch {
    return null;
  }
}
