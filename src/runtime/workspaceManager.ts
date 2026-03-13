import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import {
  getWorkspaceRoot as getConfigRoot,
  getForbiddenDirNames,
  isPathWithinWorkspace,
} from "../config/workspace.js";

dotenv.config();

function getWorkspaceRoot(): string {
  return getConfigRoot();
}

function normalizeRelativePath(p: string): string {
  let rel = p.replace(/\\/g, "/");
  if (rel.startsWith("./")) rel = rel.slice(2);
  if (rel.startsWith("/")) rel = rel.slice(1);
  if (rel.startsWith("workspace/")) rel = rel.slice("workspace/".length);
  if (rel === "") rel = ".";
  return rel;
}

export { getWorkspaceRoot };

const ROOT = getConfigRoot();
const FORBIDDEN_DIRS = getForbiddenDirNames();

export async function listWorkspaceFiles(relativeDir = "."): Promise<string[]> {
  const normalized = normalizeRelativePath(relativeDir);
  const base = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, base)) {
    return [];
  }
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && FORBIDDEN_DIRS.has(entry.name.toLowerCase())) {
      continue;
    }
    const fullPath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listWorkspaceFiles(fullPath);
      files.push(...nested);
    } else {
      files.push(fullPath.replace(/\\/g, "/"));
    }
  }

  return files;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

export async function listWorkspaceDirectEntries(relativeDir = "."): Promise<WorkspaceEntry[]> {
  const normalized = normalizeRelativePath(relativeDir);
  const base = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, base)) {
    return [];
  }
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const result: WorkspaceEntry[] = [];
  for (const entry of entries) {
    const fullPath = path.join(relativeDir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: fullPath, type: "directory" });
    } else {
      result.push({ name: entry.name, path: fullPath, type: "file" });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readWorkspaceFile(
  relativePath: string,
): Promise<string> {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return fs.readFile(fullPath, "utf8");
}

export async function workspaceFileExists(relativePath: string): Promise<boolean> {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) return false;
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function statWorkspacePath(relativePath: string): Promise<{
  isFile: boolean;
  isDirectory: boolean;
}> {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  try {
    const stat = await fs.stat(fullPath);
    return {
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error(`Path does not exist: ${relativePath}`);
    throw err;
  }
}

export async function writeWorkspaceFile(
  relativePath: string,
  content: string,
): Promise<void> {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
}

export async function mkdirWorkspaceFolder(relativePath: string): Promise<void> {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  await fs.mkdir(fullPath, { recursive: true });
}

export async function touchWorkspaceFile(relativePath: string): Promise<{ existed: boolean }> {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  let existed = true;
  try {
    await fs.access(fullPath);
  } catch {
    existed = false;
  }
  const fh = await fs.open(fullPath, "a");
  await fh.close();
  const now = new Date();
  await fs.utimes(fullPath, now, now);
  return { existed };
}

export async function deleteWorkspaceFile(relativePath: string): Promise<void> {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  await fs.unlink(fullPath);
}

export async function deleteWorkspaceFiles(relativePaths: string[]): Promise<void> {
  for (const relativePath of relativePaths) {
    const normalized = normalizeRelativePath(relativePath);
    const fullPath = path.resolve(ROOT, normalized);
    if (!isPathWithinWorkspace(ROOT, fullPath)) {
      throw new Error(`Path escapes workspace: ${relativePath}`);
    }
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
  }
}

export async function deleteWorkspaceFolder(relativePath: string): Promise<void> {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === "." || normalized === "" || normalized === "..") {
    throw new Error("Cannot delete workspace root or parent");
  }
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  const parts = normalized.split("/").map((p) => p.toLowerCase());
  if (parts.some((p) => p === ".git")) {
    throw new Error("Cannot delete .git directory");
  }

  async function removeRecursive(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await removeRecursive(full);
      } else {
        await fs.unlink(full);
      }
    }
    await fs.rmdir(dirPath);
  }

  await removeRecursive(fullPath);
}

export async function moveWorkspaceFile(
  fromRelative: string,
  toRelative: string,
): Promise<void> {
  const fromNorm = normalizeRelativePath(fromRelative);
  const toNorm = normalizeRelativePath(toRelative);
  const fromFull = path.resolve(ROOT, fromNorm);
  const toFull = path.resolve(ROOT, toNorm);
  if (!isPathWithinWorkspace(ROOT, fromFull) || !isPathWithinWorkspace(ROOT, toFull)) {
    throw new Error("Paths must be within workspace");
  }
  await fs.mkdir(path.dirname(toFull), { recursive: true });
  await fs.rename(fromFull, toFull);
}

export async function copyWorkspaceFile(
  fromRelative: string,
  toRelative: string,
): Promise<void> {
  const fromNorm = normalizeRelativePath(fromRelative);
  const toNorm = normalizeRelativePath(toRelative);
  const fromFull = path.resolve(ROOT, fromNorm);
  const toFull = path.resolve(ROOT, toNorm);
  if (!isPathWithinWorkspace(ROOT, fromFull) || !isPathWithinWorkspace(ROOT, toFull)) {
    throw new Error("Paths must be within workspace");
  }
  await fs.mkdir(path.dirname(toFull), { recursive: true });
  await fs.copyFile(fromFull, toFull);
}

const BACKUP_ENABLED =
  process.env.BACKUP_BEFORE_WRITE === "true" ||
  process.env.BACKUP_BEFORE_WRITE === "1";

export async function backupFileIfExists(
  relativePath: string,
): Promise<void> {
  if (!BACKUP_ENABLED) return;
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(ROOT, normalized);
  if (!isPathWithinWorkspace(ROOT, fullPath)) return;
  try {
    const content = await fs.readFile(fullPath, "utf8");
    const backupDir = path.resolve(ROOT, ".agent-backups");
    await fs.mkdir(backupDir, { recursive: true });
    const safeName = normalized.replace(/[/\\]/g, "_");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `${ts}_${safeName}`);
    await fs.writeFile(backupPath, content, "utf8");
  } catch {
    // File does not exist or not readable: nothing to backup
  }
}

