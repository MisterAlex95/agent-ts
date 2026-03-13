import { deleteWorkspaceFile } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { DeleteFileResult } from "./types.js";

export async function deleteFileTool(pathRelative: string): Promise<DeleteFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(
      "deleteFileTool: cannot delete protected path. For directories use deleteFolder, not deleteFile.",
    );
  }
  try {
    await deleteWorkspaceFile(pathRelative);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EISDIR") {
      throw new Error(
        "deleteFileTool: path is a directory. Use deleteFolder for directories, not deleteFile.",
      );
    }
    throw err;
  }
  return { path: pathRelative.replace(/\\/g, "/"), deleted: true };
}
