/**
 * Trigger RAG re-index after file-changing tool calls.
 */
import { indexWorkspaceFiles, removeFileFromIndex } from "../../rag/indexer.js";

export function triggerAutoIndex(
  tool: string,
  params: unknown,
  result?: unknown,
): void {
  const p = params as Record<string, unknown>;
  const path = typeof p?.path === "string" ? p.path : "";
  const paths = Array.isArray(p?.paths) ? (p.paths as string[]) : [];
  const from = typeof p?.from === "string" ? p.from : "";
  const to = typeof p?.to === "string" ? p.to : "";
  const res = result as Record<string, unknown> | undefined;
  const deletedFiles = Array.isArray(res?.deletedFiles)
    ? (res.deletedFiles as string[])
    : [];

  void (async () => {
    try {
      if (tool === "writeFile" || tool === "editLines" || tool === "searchReplace" || tool === "appendFile") {
        if (path) await indexWorkspaceFiles([path]);
      } else if (tool === "deleteFile") {
        if (path) await removeFileFromIndex(path);
      } else if (tool === "deleteFiles") {
        for (const f of paths) if (f) await removeFileFromIndex(f);
      } else if (tool === "deleteFolder" || tool === "deletePath") {
        const files =
          tool === "deletePath" && res?.type === "file" ? [path] : deletedFiles;
        for (const f of files) if (f) await removeFileFromIndex(f);
      } else if (tool === "moveFile") {
        if (from) await removeFileFromIndex(from);
        if (to) await indexWorkspaceFiles([to]);
      } else if (tool === "copyFile") {
        if (to) await indexWorkspaceFiles([to]);
      }
    } catch {
      // ignore index errors so the agent loop is not affected
    }
  })();
}
