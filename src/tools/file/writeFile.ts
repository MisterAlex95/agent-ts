import { readWorkspaceFile, writeWorkspaceFile, backupFileIfExists } from "../../runtime/workspaceManager.js";
import { isProtectedPath, truncateText } from "./helpers.js";
import type { WriteFileResult } from "./types.js";

export async function writeFileTool(
  pathRelative: string,
  content: string,
): Promise<WriteFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`writeFileTool: access to protected path '${pathRelative}'`);
  }
  let previousContent: string | undefined;
  try {
    previousContent = await readWorkspaceFile(pathRelative);
  } catch {
    previousContent = undefined;
  }
  await backupFileIfExists(pathRelative);
  await writeWorkspaceFile(pathRelative, content);
  const normalized = pathRelative.replace(/\\/g, "/");

  const prev =
    typeof previousContent === "string"
      ? truncateText(previousContent)
      : undefined;
  const next = truncateText(content);

  return {
    path: normalized,
    previousContentSnippet: prev?.text,
    newContentSnippet: next.text,
    truncated: Boolean(prev?.truncated || next.truncated),
    previousContentChars: prev?.originalChars,
    newContentChars: next.originalChars,
  };
}
