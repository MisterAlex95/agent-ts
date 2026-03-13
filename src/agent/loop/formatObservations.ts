/**
 * Format observation summaries and extract paths for the planner context.
 */
import { AGENT_CONFIG } from "../../config/agent.js";

export function formatSearchChunk(
  r: {
    filePath?: string;
    symbol?: string;
    startLine?: number;
    endLine?: number;
    content?: string;
  },
  maxContentChars: number,
): string {
  const path = r.filePath ?? "?";
  const lineRange =
    typeof r.startLine === "number" && typeof r.endLine === "number"
      ? ` lines ${r.startLine}-${r.endLine}`
      : typeof r.startLine === "number"
        ? ` line ${r.startLine}`
        : "";
  const symbolPart = r.symbol ? ` symbol: ${r.symbol}` : "";
  const header = `[${path}]${lineRange}${symbolPart}\n`;
  return header + String(r.content ?? "").slice(0, maxContentChars);
}

export function getAlreadyReadPaths(summaries: string[]): string {
  const paths: string[] = [];
  for (const s of summaries) {
    if (s.includes("Tool: readFile")) {
      const m = s.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) paths.push(m[1]);
    }
    if (s.includes("Tool: readFiles")) {
      const inputLine = s.split("\n").find((l) => l.startsWith("Input:"));
      if (inputLine) {
        try {
          const obj = JSON.parse(inputLine.replace(/^Input:\s*/, "")) as { paths?: string[] };
          if (Array.isArray(obj.paths)) paths.push(...obj.paths);
        } catch {
          // ignore parse errors
        }
      }
    }
  }
  return [...new Set(paths)].join(", ");
}

export function getHasPerformedWrite(summaries: string[]): boolean {
  const writeTools = ["writeFile", "searchReplace", "appendFile", "editLines"];
  return summaries.some((s) => writeTools.some((t) => s.includes("Tool: " + t)));
}

export function getAlreadyListedPaths(summaries: string[]): string {
  const paths: string[] = [];
  for (const s of summaries) {
    if (!s.includes("Tool: listFiles")) continue;
    const m = s.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) paths.push(m[1]);
  }
  return [...new Set(paths)].join(", ");
}

export function formatRecentObservations(summaries: string[]): string {
  const cfg = AGENT_CONFIG;
  if (summaries.length <= cfg.observationsSummaryThreshold) {
    return summaries.slice(-5).join("\n---\n");
  }
  const tail = summaries.slice(-cfg.observationsTailCount).join("\n---\n");
  const toolNames = summaries
    .slice(0, -cfg.observationsTailCount)
    .map((s) => {
      const m = s.match(/Tool:\s*(\w+)/);
      return m ? m[1] : "?";
    })
    .join(", ");
  return `Earlier steps (${summaries.length - cfg.observationsTailCount}): ${toolNames}\n---\n${tail}`;
}

const TRACE_OUTPUT_MAX = 600;

export function truncateForTrace(output: unknown): string {
  const s = typeof output === "string" ? output : JSON.stringify(output);
  return s.length <= TRACE_OUTPUT_MAX
    ? s
    : s.slice(0, TRACE_OUTPUT_MAX) + "...";
}
