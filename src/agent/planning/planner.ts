import { getLLMProvider } from "../../llm/provider.js";
import type { ToolName } from "../memory/index.js";
import type { RunMode } from "../../api/schema.js";
import {
  getPlannerSystemPrompt,
  getPlannerUserPrompt,
  getPlannerAskModePrompt,
  PLANNER_RETRY_PROMPT,
  PLANNER_FALLBACK_PROMPT,
} from "../../prompts/planner.js";
import { logger } from "../../logger.js";
import { getToolsForPlanner, READ_ONLY_TOOLS, EXECUTABLE_TOOL_NAMES } from "../../tools/registry/index.js";

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
  /** Project rules from .agent/rules or AGENTS.md */
  projectRules?: string;
  /** Paths to prioritize (user focus, e.g. @file) */
  focusPaths?: string[];
  conversationHistory?: string;
  /** Paths already read in this run (do not call readFile again for these) */
  alreadyReadPaths?: string;
  /** Paths already listed (do not call listFiles again for these) */
  alreadyListedPaths?: string;
  stepsRemaining?: number;
  maxSteps?: number;
  /** True if at least one write (writeFile, searchReplace, appendFile, editLines) was already run */
  hasPerformedWrite?: boolean;
  /** Called with each planner LLM stream delta for live UI updates */
  onPlannerChunk?: (delta: string) => void;
  /** When aborted, stream stops and returns partial content for resume */
  signal?: AbortSignal;
  /** Fixed seed for reproducible generation and resume */
  seed?: number;
}

export { READ_ONLY_TOOLS };

const TOOLS = getToolsForPlanner();

function extractThinkingAndJson(content: string): { thinking: string; json: string } {
  const trimmed = content.trim();
  const thinkMatch = trimmed.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const afterThink = trimmed.slice(trimmed.indexOf(thinkMatch[0]) + thinkMatch[0].length).trim();
    return { thinking, json: afterThink };
  }
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace > 0) {
    return { thinking: trimmed.slice(0, firstBrace).trim(), json: trimmed.slice(firstBrace) };
  }
  return { thinking: "", json: trimmed };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : trimmed;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Common streaming artifact: multiple JSON objects concatenated.
    // Try to parse the first complete JSON object by brace matching.
    const firstBrace = raw.indexOf("{");
    if (firstBrace !== -1) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = firstBrace; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === "\"") {
            inString = false;
          }
          continue;
        }
        if (ch === "\"") {
          inString = true;
          continue;
        }
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        if (depth === 0 && i > firstBrace) {
          const candidate = raw.slice(firstBrace, i + 1);
          try {
            return JSON.parse(candidate) as unknown;
          } catch {
            break;
          }
        }
      }
    }

    const fallback = raw.match(/\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:\s*\{[^}]*\}\s*\}/);
    if (fallback) {
      try {
        return JSON.parse(fallback[0]) as unknown;
      } catch {
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

  const validTools: ToolName[] = allowedTools ?? EXECUTABLE_TOOL_NAMES;
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
    case "readFiles":
      normalized.paths = Array.isArray(paramsObj.paths)
        ? (paramsObj.paths as unknown[]).filter((p): p is string => typeof p === "string")
        : [];
      break;
    case "mkdir":
    case "touch":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : "";
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
    case "searchReplace":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : "";
      normalized.oldText =
        typeof paramsObj.oldText === "string" ? paramsObj.oldText : "";
      normalized.newText =
        typeof paramsObj.newText === "string" ? paramsObj.newText : "";
      break;
    case "appendFile":
      normalized.path =
        typeof paramsObj.path === "string" ? paramsObj.path : "";
      normalized.content =
        typeof paramsObj.content === "string" ? paramsObj.content : "";
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
      if (typeof paramsObj.cwd === "string") normalized.cwd = paramsObj.cwd;
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
  const allowedTools: ToolName[] = isAsk ? READ_ONLY_TOOLS : EXECUTABLE_TOOL_NAMES;

  const toolsList = Object.entries(TOOLS)
    .filter(([name]) => name === "DONE" || allowedTools.includes(name as ToolName))
    .map(([name, { params }]) => `- ${name}: ${params}`)
    .join("\n");

  const systemPrompt = isAsk
    ? getPlannerAskModePrompt(toolsList, ctx.projectRules)
    : getPlannerSystemPrompt(toolsList, ctx.projectRules);
  const userPrompt = getPlannerUserPrompt(ctx);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const llm = getLLMProvider();
  const seed = ctx.seed ?? 42;
  const streamOptions = {
    temperature: 0.1,
    seed,
    onChunk: ctx.onPlannerChunk,
    signal: ctx.signal,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let content: string;
      const result = await llm.chatStream(messages, streamOptions);
      if (result.partial) {
        messages.push({
          role: "assistant",
          content: result.content + "\n\nContinue exactly from where you stopped.",
        });
        const resumeResult = await llm.chatStream(messages, streamOptions);
        if (resumeResult.partial) {
          return null;
        }
        content = resumeResult.content;
      } else {
        content = result.content;
      }
      const { json } = extractThinkingAndJson(content);
      const data = extractJson(json);
      // If the model says DONE, do not "retry": just end planning cleanly.
      if (
        data &&
        typeof data === "object" &&
        (data as Record<string, unknown>).tool === "DONE"
      ) {
        return null;
      }
      const parsed = parsePlannedAction(data, allowedTools);
      if (parsed) return parsed;
      if (attempt === 0) {
        messages.push({
          role: "assistant",
          content: typeof content === "string" ? content.slice(0, 500) : "",
        });
        messages.push({ role: "user", content: PLANNER_RETRY_PROMPT });
      }
      if (!parsed && attempt === 1) {
        logger.warn("[planNextAction] Could not parse a valid PlannedAction from model output", {
          task: ctx.task,
          mode: ctx.mode,
        });
      }
    } catch (error) {
      logger.error("[planNextAction] Planner LLM call failed", {
        attempt,
        task: ctx.task,
        mode: ctx.mode,
        error,
      });
      if (attempt === 1) return null;
      messages.push({ role: "user", content: PLANNER_FALLBACK_PROMPT });
    }
  }
  return null;
}
