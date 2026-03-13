import { readWorkspaceFile } from "../../runtime/workspaceManager.js";
import { isProtectedPath, truncateText } from "./helpers.js";
import { READ_FILE_BEGIN_MARKER, READ_FILE_END_MARKER } from "./helpers.js";
import type { ReadFileResult } from "./types.js";

export async function readFileTool(pathRelative: string): Promise<ReadFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`readFileTool: access to protected path '${pathRelative}'`);
  }
  const raw = await readWorkspaceFile(pathRelative);
  const wrapped = READ_FILE_BEGIN_MARKER + raw + READ_FILE_END_MARKER;
  const { text, truncated, originalChars } = truncateText(wrapped);
  return {
    path: pathRelative.replace(/\\/g, "/"),
    contentSnippet: text,
    truncated,
    totalChars: originalChars,
  };
}
