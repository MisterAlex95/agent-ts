import { readWorkspaceFile, writeWorkspaceFile, backupFileIfExists } from "../../runtime/workspaceManager.js";
import { isProtectedPath, truncateText } from "./helpers.js";
import type { AppendFileResult } from "./types.js";

export async function appendFileTool(
  pathRelative: string,
  content: string,
): Promise<AppendFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`appendFileTool: access to protected path '${pathRelative}'`);
  }
  let previousContent = "";
  try {
    previousContent = await readWorkspaceFile(pathRelative);
  } catch {
    previousContent = "";
  }
  const updated = previousContent + content;
  await backupFileIfExists(pathRelative);
  await writeWorkspaceFile(pathRelative, updated);

  const prev = truncateText(previousContent);
  const app = truncateText(content);
  return {
    path: pathRelative.replace(/\\/g, "/"),
    previousContentSnippet: prev.text,
    appendedContentSnippet: app.text,
    truncated: prev.truncated || app.truncated,
    previousContentChars: prev.originalChars,
    appendedContentChars: app.originalChars,
  };
}
