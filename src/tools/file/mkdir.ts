import { mkdirWorkspaceFolder } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { MkdirResult } from "./types.js";

export async function mkdirTool(pathRelative: string): Promise<MkdirResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`mkdirTool: access to protected path '${pathRelative}'`);
  }
  await mkdirWorkspaceFolder(pathRelative);
  return { path: pathRelative.replace(/\\/g, "/") };
}

