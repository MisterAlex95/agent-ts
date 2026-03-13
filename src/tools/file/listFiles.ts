import { getWorkspaceRoot, listWorkspaceFiles, listWorkspaceDirectEntries } from "../../runtime/workspaceManager.js";
import type { ListFilesResult } from "./types.js";

export async function listFilesTool(relativePath: string): Promise<ListFilesResult> {
  const root = getWorkspaceRoot();
  const [files, entries] = await Promise.all([
    listWorkspaceFiles(relativePath),
    listWorkspaceDirectEntries(relativePath),
  ]);
  return { root, files, entries };
}
