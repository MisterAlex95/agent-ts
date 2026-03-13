import { workspaceFileExists } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { FileExistsResult } from "./types.js";

export async function fileExistsTool(pathRelative: string): Promise<FileExistsResult> {
  if (isProtectedPath(pathRelative)) {
    return { path: pathRelative.replace(/\\/g, "/"), exists: false };
  }
  const exists = await workspaceFileExists(pathRelative);
  return { path: pathRelative.replace(/\\/g, "/"), exists };
}
