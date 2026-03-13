import { readWorkspaceFile } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { WcResult } from "./types.js";

export async function wcTool(pathRelative: string): Promise<WcResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error("wcTool: cannot read protected path");
  }
  const normalized = pathRelative.replace(/\\/g, "/");
  const content = await readWorkspaceFile(normalized);
  const lines = content.split(/\r?\n/).length;
  const words = content.split(/\s+/).filter(Boolean).length;
  const bytes = Buffer.byteLength(content, "utf8");
  return { path: normalized, lines, words, bytes };
}
