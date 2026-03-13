import { readWorkspaceFile } from "../../runtime/workspaceManager.js";
import { isProtectedPath, READ_FILE_BEGIN_MARKER, READ_FILE_END_MARKER } from "./helpers.js";
import type { ReadFilesResult } from "./types.js";

export async function readFilesTool(paths: string[]): Promise<ReadFilesResult> {
  const normalized = (paths ?? [])
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .map((p) => p.replace(/\\/g, "/").trim());
  const files: Array<{ path: string; content: string }> = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const pathRelative of normalized) {
    if (isProtectedPath(pathRelative)) {
      errors.push({ path: pathRelative, error: "protected path" });
      continue;
    }
    try {
      const raw = await readWorkspaceFile(pathRelative);
      const content = READ_FILE_BEGIN_MARKER + raw + READ_FILE_END_MARKER;
      files.push({ path: pathRelative, content });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ path: pathRelative, error: message });
    }
  }

  return { files, ...(errors.length > 0 ? { errors } : {}) };
}
