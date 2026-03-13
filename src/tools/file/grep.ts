import { readWorkspaceFile, listWorkspaceFiles } from "../../runtime/workspaceManager.js";
import { isProtectedPath, escapeRegex } from "./helpers.js";
import { DEFAULT_GREP_MAX_MATCHES } from "./helpers.js";
import type { GrepResult } from "./types.js";

export async function grepTool(
  pathOrDir: string,
  pattern: string,
  options?: { caseInsensitive?: boolean; maxMatches?: number },
): Promise<GrepResult> {
  const maxMatches = options?.maxMatches ?? DEFAULT_GREP_MAX_MATCHES;
  const flags = options?.caseInsensitive ? "i" : "";
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    regex = new RegExp(escapeRegex(pattern), flags);
  }
  const normalized = pathOrDir.replace(/\\/g, "/").trim() || ".";
  let files: string[] = [];
  try {
    await readWorkspaceFile(normalized);
    files = [normalized];
  } catch {
    const list = await listWorkspaceFiles(normalized);
    files = list.filter((f) => !isProtectedPath(f));
  }
  const matches: Array<{ path: string; lineNumber: number; line: string; match: string }> = [];
  for (const file of files) {
    if (matches.length >= maxMatches) break;
    try {
      const content = await readWorkspaceFile(file);
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
        const line = lines[i];
        const m = line.match(regex);
        if (m) {
          matches.push({
            path: file,
            lineNumber: i + 1,
            line,
            match: m[0],
          });
        }
      }
    } catch {
      continue;
    }
  }
  return {
    pattern,
    path: normalized,
    matches,
    truncated: matches.length >= maxMatches,
  };
}
