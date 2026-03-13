import { listWorkspaceFiles } from "../../runtime/workspaceManager.js";
import { isProtectedPath, globToRegex } from "./helpers.js";
import type { FindFilesResult } from "./types.js";

export async function findFilesTool(
  dirPath: string,
  namePattern: string,
): Promise<FindFilesResult> {
  const normalized = (dirPath || ".").replace(/\\/g, "/");
  const all = await listWorkspaceFiles(normalized);
  const re = globToRegex(namePattern);
  const files = all.filter((f) => !isProtectedPath(f) && re.test(f));
  return {
    path: normalized,
    pattern: namePattern,
    files: files.sort(),
  };
}
