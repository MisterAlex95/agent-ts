import { moveWorkspaceFile } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { MoveFileResult } from "./types.js";

export async function moveFileTool(
  fromPath: string,
  toPath: string,
): Promise<MoveFileResult> {
  if (isProtectedPath(fromPath) || isProtectedPath(toPath)) {
    throw new Error("moveFileTool: cannot move from or to a protected path");
  }
  await moveWorkspaceFile(fromPath, toPath);
  return {
    from: fromPath.replace(/\\/g, "/"),
    to: toPath.replace(/\\/g, "/"),
  };
}
