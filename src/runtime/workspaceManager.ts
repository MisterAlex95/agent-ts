import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT ??
  path.resolve(process.cwd(), "workspace").replace(/\\/g, "/");

function normalizeRelativePath(p: string): string {
  let rel = p.replace(/\\/g, "/");
  if (rel.startsWith("./")) rel = rel.slice(2);
  if (rel.startsWith("/")) rel = rel.slice(1);
  if (rel.startsWith("workspace/")) rel = rel.slice("workspace/".length);
  if (rel === "") rel = ".";
  return rel;
}

export function getWorkspaceRoot(): string {
  return WORKSPACE_ROOT;
}

export async function listWorkspaceFiles(relativeDir = "."): Promise<string[]> {
  const normalized = normalizeRelativePath(relativeDir);
  const base = path.resolve(WORKSPACE_ROOT, normalized);
  const entries = await fs.readdir(base, { withFileTypes: true });

  const files: string[] = [];
  for (const entry of entries) {
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
  const fullPath = path.resolve(WORKSPACE_ROOT, normalized);
  return fs.readFile(fullPath, "utf8");
}

export async function writeWorkspaceFile(
  relativePath: string,
  content: string,
): Promise<void> {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = path.resolve(WORKSPACE_ROOT, normalized);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
}

