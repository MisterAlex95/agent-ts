import { deleteWorkspaceFiles } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { DeleteFilesResult } from "./types.js";

export async function deleteFilesTool(paths: string[]): Promise<DeleteFilesResult> {
  const normalized = paths.map((p) => p.replace(/\\/g, "/")).filter(Boolean);
  for (const p of normalized) {
    if (isProtectedPath(p)) {
      throw new Error(`deleteFilesTool: cannot delete protected path '${p}'`);
    }
  }
  await deleteWorkspaceFiles(normalized);
  return { deleted: normalized };
}
