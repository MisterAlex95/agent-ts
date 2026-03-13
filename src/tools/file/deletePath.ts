import {
  statWorkspacePath,
  deleteWorkspaceFile,
  listWorkspaceFiles,
  deleteWorkspaceFolder,
} from "../../runtime/workspaceManager.js";
import { isProtectedPath, isGitPath } from "./helpers.js";
import type { DeletePathResult } from "./types.js";

export async function deletePathTool(pathRelative: string): Promise<DeletePathResult> {
  const normalized = pathRelative.replace(/\\/g, "/").trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("deletePathTool: cannot delete root or parent");
  }
  if (isGitPath(normalized)) {
    throw new Error("deletePathTool: cannot delete .git directory");
  }
  const stat = await statWorkspacePath(normalized);
  if (stat.isFile) {
    if (isProtectedPath(normalized)) {
      throw new Error("deletePathTool: cannot delete protected path");
    }
    await deleteWorkspaceFile(normalized);
    return { path: normalized, deleted: true, type: "file" };
  }
  if (stat.isDirectory) {
    const filesInside = await listWorkspaceFiles(normalized);
    const toRemove = filesInside.filter((f) => !isProtectedPath(f));
    await deleteWorkspaceFolder(normalized);
    return { path: normalized, deleted: true, type: "directory", deletedFiles: toRemove };
  }
  throw new Error("deletePathTool: path is neither a file nor a directory");
}
