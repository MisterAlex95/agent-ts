import { touchWorkspaceFile } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { TouchResult } from "./types.js";

export async function touchTool(pathRelative: string): Promise<TouchResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`touchTool: access to protected path '${pathRelative}'`);
  }
  const { existed } = await touchWorkspaceFile(pathRelative);
  return { path: pathRelative.replace(/\\/g, "/"), existed };
}

