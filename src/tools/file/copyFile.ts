import { copyWorkspaceFile } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { CopyFileResult } from "./types.js";

export async function copyFileTool(
  fromPath: string,
  toPath: string,
): Promise<CopyFileResult> {
  if (isProtectedPath(fromPath) || isProtectedPath(toPath)) {
    throw new Error("copyFileTool: cannot copy from or to a protected path");
  }
  await copyWorkspaceFile(fromPath, toPath);
  return {
    from: fromPath.replace(/\\/g, "/"),
    to: toPath.replace(/\\/g, "/"),
  };
}
