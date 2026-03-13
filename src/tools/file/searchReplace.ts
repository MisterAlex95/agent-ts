import { readWorkspaceFile, writeWorkspaceFile, backupFileIfExists } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { SearchReplaceResult } from "./types.js";

export async function searchReplaceTool(
  pathRelative: string,
  oldText: string,
  newText: string,
): Promise<SearchReplaceResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`searchReplaceTool: access to protected path '${pathRelative}'`);
  }
  if (typeof oldText !== "string" || oldText.length === 0) {
    throw new Error("searchReplaceTool: oldText must be a non-empty string");
  }
  const original = await readWorkspaceFile(pathRelative);
  const idx = original.indexOf(oldText);
  if (idx === -1) {
    return {
      path: pathRelative.replace(/\\/g, "/"),
      replaced: false,
      message: "oldText not found in file (check whitespace and exact string)",
    };
  }
  const updated = original.slice(0, idx) + newText + original.slice(idx + oldText.length);
  await backupFileIfExists(pathRelative);
  await writeWorkspaceFile(pathRelative, updated);
  return {
    path: pathRelative.replace(/\\/g, "/"),
    replaced: true,
    message: "Replaced first occurrence",
  };
}
