import {
  listWorkspaceFiles,
  deleteWorkspaceFolder,
} from "../../runtime/workspaceManager.js";
import { isProtectedPath, isGitPath } from "./helpers.js";
import type { DeleteFolderResult } from "./types.js";

export async function deleteFolderTool(pathRelative: string): Promise<DeleteFolderResult> {
  const normalized = pathRelative.replace(/\\/g, "/").trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("deleteFolderTool: cannot delete root or parent");
  }
  if (isGitPath(normalized)) {
    throw new Error("deleteFolderTool: cannot delete .git directory");
  }
  const filesInside = await listWorkspaceFiles(normalized);
  const toRemove = filesInside.filter((f) => !isProtectedPath(f));
  await deleteWorkspaceFolder(normalized);
  return { path: normalized, deletedFiles: toRemove };
}
