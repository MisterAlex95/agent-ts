import { readWorkspaceFile, writeWorkspaceFile, backupFileIfExists } from "../../runtime/workspaceManager.js";
import { isProtectedPath, truncateText } from "./helpers.js";
import type { FilePatchOperation, PatchFileResult } from "./types.js";

export async function patchFileTool(
  pathRelative: string,
  operations: FilePatchOperation[],
): Promise<PatchFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`patchFileTool: access to protected path '${pathRelative}'`);
  }
  const original = await readWorkspaceFile(pathRelative);
  let updated = original;
  let applied = 0;
  for (const op of operations) {
    if (op.type === "replace" && op.search) {
      const before = updated;
      updated = updated.split(op.search).join(op.replace);
      if (updated !== before) applied += 1;
    }
  }
  if (applied > 0 && updated !== original) {
    await backupFileIfExists(pathRelative);
    await writeWorkspaceFile(pathRelative, updated);
  }

  const prev = truncateText(original);
  const next = truncateText(updated);
  return {
    path: pathRelative.replace(/\\/g, "/"),
    previousContentSnippet: prev.text,
    newContentSnippet: next.text,
    appliedOperations: applied,
    truncated: prev.truncated || next.truncated,
    previousContentChars: prev.originalChars,
    newContentChars: next.originalChars,
  };
}
