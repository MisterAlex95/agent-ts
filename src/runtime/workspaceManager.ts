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

