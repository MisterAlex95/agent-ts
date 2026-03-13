import path from "node:path";
import { isProtectedPath, escapeRegex } from "./helpers.js";
import { grepTool } from "./grep.js";
import type { ReferencedByResult } from "./types.js";

export async function referencedByTool(filePath: string): Promise<ReferencedByResult> {
  if (isProtectedPath(filePath)) {
    throw new Error("referencedByTool: cannot search for protected path");
  }
  const normalized = filePath.replace(/\\/g, "/");
  const base = path.basename(normalized);
  const stem = base.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, "") || base;
  const pattern = "\\b" + escapeRegex(stem) + "\\b";
  const grepResult = await grepTool(".", pattern, { maxMatches: 50 });
  const referencedBy = grepResult.matches
    .filter((m) => m.path !== normalized)
    .map((m) => ({ path: m.path, lineNumber: m.lineNumber, line: m.line }));
  return { path: normalized, stem, referencedBy };
}
