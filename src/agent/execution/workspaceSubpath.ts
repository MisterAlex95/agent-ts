/**
 * When the agent runs in a board with a project_path, all file paths are restricted to that subpath.
 * This helper prefixes and validates paths so they stay under the project directory.
 */

export function applyWorkspaceSubpath(relativePath: string, subpath: string): string {
  const base = subpath.replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\.\//, "");
  if (!base) return relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const prefix = base + "/";
  const incoming = relativePath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  const combined = (prefix + incoming).replace(/\/+/g, "/");
  const baseSegments = base.split("/").filter(Boolean);
  const parts = combined.split("/").filter(Boolean);
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === "..") {
      if (resolved.length <= baseSegments.length) {
        throw new Error("Path escapes project directory (no .. above project root)");
      }
      resolved.pop();
    } else if (p !== ".") {
      resolved.push(p);
    }
  }
  const result = resolved.join("/");
  const resultSegments = result.split("/");
  for (let i = 0; i < baseSegments.length; i++) {
    if (resultSegments[i] !== baseSegments[i]) {
      throw new Error("Path escapes project directory");
    }
  }
  return result;
}

export function applyWorkspaceSubpathToParams(
  params: Record<string, unknown>,
  toolName: string,
  subpath: string,
): Record<string, unknown> {
  const out = { ...params };
  const pathKeys = ["path", "from", "to", "cwd"];
  if (toolName === "readFiles" && Array.isArray(out.paths)) {
    out.paths = (out.paths as string[]).map((p) => applyWorkspaceSubpath(p, subpath));
  }
  if (toolName === "deleteFiles" && Array.isArray(out.paths)) {
    out.paths = (out.paths as string[]).map((p) => applyWorkspaceSubpath(p, subpath));
  }
  for (const key of pathKeys) {
    if (typeof out[key] === "string" && (out[key] as string).trim() !== "") {
      (out as Record<string, unknown>)[key] = applyWorkspaceSubpath(out[key] as string, subpath);
    }
  }
  return out;
}
