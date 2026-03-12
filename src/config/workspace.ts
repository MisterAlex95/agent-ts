import path from "node:path";

const DEFAULT_FORBIDDEN =
  ".git,node_modules,dist,build,coverage,.next,.nuxt,.agent-backups";

export function getWorkspaceRoot(): string {
  const root =
    process.env.WORKSPACE_ROOT ??
    path.resolve(process.cwd(), "workspace").replace(/\\/g, "/");
  return root;
}

export function getForbiddenDirNames(): Set<string> {
  const raw = process.env.WORKSPACE_FORBIDDEN_DIRS ?? DEFAULT_FORBIDDEN;
  const list = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set(list);
}

export function isPathWithinWorkspace(
  workspaceRoot: string,
  resolvedPath: string,
): boolean {
  const normalizedRoot = path.resolve(workspaceRoot) + path.sep;
  const normalizedPath = path.resolve(resolvedPath) + path.sep;
  return normalizedPath.startsWith(normalizedRoot);
}

export function isForbiddenRelativePath(
  relativePath: string,
  forbiddenDirs: Set<string>,
): boolean {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  const lower = parts.map((p) => p.toLowerCase());
  return lower.some((p) => forbiddenDirs.has(p));
}
