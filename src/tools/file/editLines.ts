import { readWorkspaceFile, writeWorkspaceFile, backupFileIfExists } from "../../runtime/workspaceManager.js";
import { isProtectedPath } from "./helpers.js";
import type { EditLineOp, EditLinesResult } from "./types.js";

export async function editLinesTool(
  pathRelative: string,
  edits: EditLineOp[],
): Promise<EditLinesResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`editLinesTool: access to protected path '${pathRelative}'`);
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    return { path: pathRelative.replace(/\\/g, "/"), applied: 0, message: "No edits" };
  }
  const original = await readWorkspaceFile(pathRelative);
  const lines = original.split(/\r?\n/);
  const sortedEdits = [...edits].sort((a, b) => {
    const order = (a.mode === "insert" ? 1 : 0) - (b.mode === "insert" ? 1 : 0);
    return order !== 0 ? order : a.line - b.line;
  });
  let applied = 0;
  let offset = 0;
  for (const op of sortedEdits) {
    const lineNum = Math.max(1, op.line);
    const newLines = op.content.split(/\r?\n/);
    const mode = op.mode ?? "replace";
    if (mode === "replace") {
      const idx = lineNum - 1 + offset;
      if (idx >= 0 && idx < lines.length) {
        lines.splice(idx, 1, ...newLines);
        offset += newLines.length - 1;
        applied += 1;
      }
    } else {
      const insertAt = lineNum + offset;
      lines.splice(insertAt, 0, ...newLines);
      offset += newLines.length;
      applied += 1;
    }
  }
  const updated = lines.join("\n");
  if (updated !== original) {
    await backupFileIfExists(pathRelative);
    await writeWorkspaceFile(pathRelative, updated);
  }
  return {
    path: pathRelative.replace(/\\/g, "/"),
    applied,
    message: `Applied ${applied} edit(s)`,
  };
}
