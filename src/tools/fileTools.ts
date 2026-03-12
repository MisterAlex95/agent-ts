import {
  getWorkspaceRoot,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  backupFileIfExists,
  deleteWorkspaceFile,
  deleteWorkspaceFiles,
  deleteWorkspaceFolder,
  moveWorkspaceFile,
  copyWorkspaceFile,
  workspaceFileExists,
} from "../runtime/workspaceManager.js";
import { getForbiddenDirNames } from "../config/workspace.js";
import path from "node:path";

export interface ListFilesResult {
  root: string;
  files: string[];
}

export interface ReadFileResult {
  path: string;
  content: string;
}

export interface WriteFileResult {
  path: string;
  previousContent?: string;
  newContent: string;
}

export interface AppendFileResult {
  path: string;
  previousContentSnippet: string;
  appendedContent: string;
}

export type FilePatchOperation =
  | {
      type: "replace";
      search: string;
      replace: string;
    };

export interface PatchFileResult {
  path: string;
  previousContentSnippet: string;
  newContentSnippet: string;
  appliedOperations: number;
}

export interface EditLineOp {
  line: number;
  content: string;
  mode?: "replace" | "insert";
}

export interface EditLinesResult {
  path: string;
  applied: number;
  message: string;
}

export interface DeleteFileResult {
  path: string;
  deleted: true;
}

export interface MoveFileResult {
  from: string;
  to: string;
}

export interface CopyFileResult {
  from: string;
  to: string;
}

const PROTECTED_PATH_PATTERNS: RegExp[] = [
  /^\.git(?:\/|$)/,
  /^node_modules(?:\/|$)/,
  /^dist(?:\/|$)/,
  /^build(?:\/|$)/,
  /^.*\.log$/i,
];

function isProtectedPath(pathRelative: string): boolean {
  const normalized = pathRelative.replace(/\\/g, "/");
  if (PROTECTED_PATH_PATTERNS.some((re) => re.test(normalized))) return true;
  const parts = normalized.split("/").map((p) => p.toLowerCase());
  const forbidden = getForbiddenDirNames();
  return parts.some((p) => forbidden.has(p));
}

export async function listFilesTool(
  relativePath: string,
): Promise<ListFilesResult> {
  const root = getWorkspaceRoot();
  const files = await listWorkspaceFiles(relativePath);
  return { root, files };
}

export async function readFileTool(
  pathRelative: string,
): Promise<ReadFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`readFileTool: access to protected path '${pathRelative}'`);
  }
  const content = await readWorkspaceFile(pathRelative);
  return { path: pathRelative, content };
}

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
  return {
    path: normalized,
    previousContent,
    newContent: content,
  };
}

export async function appendFileTool(
  pathRelative: string,
  content: string,
): Promise<AppendFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(
      `appendFileTool: access to protected path '${pathRelative}'`,
    );
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

  return {
    path: pathRelative.replace(/\\/g, "/"),
    previousContentSnippet: previousContent.slice(-2000),
    appendedContent: content,
  };
}

export async function patchFileTool(
  pathRelative: string,
  operations: FilePatchOperation[],
): Promise<PatchFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(
      `patchFileTool: access to protected path '${pathRelative}'`,
    );
  }

  const original = await readWorkspaceFile(pathRelative);
  let updated = original;
  let applied = 0;

  for (const op of operations) {
    if (op.type === "replace") {
      if (!op.search) continue;
      const before = updated;
      updated = updated.split(op.search).join(op.replace);
      if (updated !== before) {
        applied += 1;
      }
    }
  }

  if (applied > 0 && updated !== original) {
    await backupFileIfExists(pathRelative);
    await writeWorkspaceFile(pathRelative, updated);
  }

  return {
    path: pathRelative.replace(/\\/g, "/"),
    previousContentSnippet: original.slice(0, 2000),
    newContentSnippet: updated.slice(0, 2000),
    appliedOperations: applied,
  };
}

/**
 * Edit file by line number (1-based). Faster than writeFile when only a few lines change:
 * agent sends path + list of { line, content, mode } instead of full file.
 */
export async function editLinesTool(
  pathRelative: string,
  edits: EditLineOp[],
): Promise<EditLinesResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`editLinesTool: access to protected path '${pathRelative}'`);
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    return { path: pathRelative.replace(/\\/g, "/"), applied: 0, message: "No edits" };
  }

  const original = await readWorkspaceFile(pathRelative);
  const lines = original.split(/\r?\n/);

  const sortedEdits = [...edits].sort((a, b) => {
    const order = (a.mode === "insert" ? 1 : 0) - (b.mode === "insert" ? 1 : 0);
    return order !== 0 ? order : a.line - b.line;
  });

  let applied = 0;
  let offset = 0;

  for (const op of sortedEdits) {
    const lineNum = Math.max(1, op.line);
    const newLines = op.content.split(/\r?\n/);
    const mode = op.mode ?? "replace";

    if (mode === "replace") {
      const idx = lineNum - 1 + offset;
      if (idx < 0 || idx >= lines.length) continue;
      lines.splice(idx, 1, ...newLines);
      offset += newLines.length - 1;
      applied += 1;
    } else {
      const insertAt = lineNum + offset;
      lines.splice(insertAt, 0, ...newLines);
      offset += newLines.length;
      applied += 1;
    }
  }

  const updated = lines.join("\n");
  if (updated !== original) {
    await backupFileIfExists(pathRelative);
    await writeWorkspaceFile(pathRelative, updated);
  }

  return {
    path: pathRelative.replace(/\\/g, "/"),
    applied,
    message: `Applied ${applied} edit(s)`,
  };
}

export async function deleteFileTool(
  pathRelative: string,
): Promise<DeleteFileResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error(`deleteFileTool: cannot delete protected path '${pathRelative}'`);
  }
  await deleteWorkspaceFile(pathRelative);
  return { path: pathRelative.replace(/\\/g, "/"), deleted: true };
}

export interface DeleteFilesResult {
  deleted: string[];
  errors?: string[];
}

export async function deleteFilesTool(
  paths: string[],
): Promise<DeleteFilesResult> {
  const normalized = paths.map((p) => p.replace(/\\/g, "/")).filter(Boolean);
  for (const p of normalized) {
    if (isProtectedPath(p)) {
      throw new Error(`deleteFilesTool: cannot delete protected path '${p}'`);
    }
  }
  await deleteWorkspaceFiles(normalized);
  return { deleted: normalized };
}

export interface DeleteFolderResult {
  path: string;
  deletedFiles: string[];
}

export async function deleteFolderTool(
  pathRelative: string,
): Promise<DeleteFolderResult> {
  const normalized = pathRelative.replace(/\\/g, "/").trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("deleteFolderTool: cannot delete root or parent");
  }
  if (isProtectedPath(normalized)) {
    throw new Error(`deleteFolderTool: cannot delete protected path '${normalized}'`);
  }
  const filesInside = await listWorkspaceFiles(normalized);
  const toRemove = filesInside.filter((f) => !isProtectedPath(f));
  await deleteWorkspaceFolder(normalized);
  return { path: normalized, deletedFiles: toRemove };
}

export async function moveFileTool(
  fromPath: string,
  toPath: string,
): Promise<MoveFileResult> {
  if (isProtectedPath(fromPath) || isProtectedPath(toPath)) {
    throw new Error("moveFileTool: cannot move from or to a protected path");
  }
  await moveWorkspaceFile(fromPath, toPath);
  return {
    from: fromPath.replace(/\\/g, "/"),
    to: toPath.replace(/\\/g, "/"),
  };
}

export async function copyFileTool(
  fromPath: string,
  toPath: string,
): Promise<CopyFileResult> {
  if (isProtectedPath(fromPath) || isProtectedPath(toPath)) {
    throw new Error("copyFileTool: cannot copy from or to a protected path");
  }
  await copyWorkspaceFile(fromPath, toPath);
  return {
    from: fromPath.replace(/\\/g, "/"),
    to: toPath.replace(/\\/g, "/"),
  };
}

export interface GrepMatch {
  path: string;
  lineNumber: number;
  line: string;
  match: string;
}

export interface GrepResult {
  pattern: string;
  path: string;
  matches: GrepMatch[];
  truncated: boolean;
}

const DEFAULT_GREP_MAX_MATCHES = 80;

export async function grepTool(
  pathOrDir: string,
  pattern: string,
  options?: { caseInsensitive?: boolean; maxMatches?: number },
): Promise<GrepResult> {
  const maxMatches = options?.maxMatches ?? DEFAULT_GREP_MAX_MATCHES;
  const flags = options?.caseInsensitive ? "i" : "";
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    regex = new RegExp(escapeRegex(pattern), flags);
  }

  const normalized = pathOrDir.replace(/\\/g, "/").trim() || ".";
  let files: string[] = [];
  try {
    await readWorkspaceFile(normalized);
    files = [normalized];
  } catch {
    const list = await listWorkspaceFiles(normalized);
    files = list.filter((f) => !isProtectedPath(f));
  }

  const matches: GrepMatch[] = [];
  for (const file of files) {
    if (matches.length >= maxMatches) break;
    try {
      const content = await readWorkspaceFile(file);
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
        const line = lines[i];
        const m = line.match(regex);
        if (m) {
          matches.push({
            path: file,
            lineNumber: i + 1,
            line,
            match: m[0],
          });
        }
      }
    } catch {
      continue;
    }
  }

  return {
    pattern,
    path: normalized,
    matches,
    truncated: matches.length >= maxMatches,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface FindFilesResult {
  path: string;
  pattern: string;
  files: string[];
}

export async function findFilesTool(
  dirPath: string,
  namePattern: string,
): Promise<FindFilesResult> {
  const normalized = (dirPath || ".").replace(/\\/g, "/");
  const all = await listWorkspaceFiles(normalized);
  const re = globToRegex(namePattern);
  const files = all.filter((f) => !isProtectedPath(f) && re.test(f));
  return {
    path: normalized,
    pattern: namePattern,
    files: files.sort(),
  };
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/\*\*/g, "\x01")
    .replace(/\*/g, "\x02")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\x02/g, "[^/]*")
    .replace(/\x01/g, ".*");
  return new RegExp(escaped + "$", "i");
}

export interface FileExistsResult {
  path: string;
  exists: boolean;
}

export async function fileExistsTool(pathRelative: string): Promise<FileExistsResult> {
  if (isProtectedPath(pathRelative)) {
    return { path: pathRelative.replace(/\\/g, "/"), exists: false };
  }
  const exists = await workspaceFileExists(pathRelative);
  return { path: pathRelative.replace(/\\/g, "/"), exists };
}

export interface WcResult {
  path: string;
  lines: number;
  words: number;
  bytes: number;
}

export async function wcTool(pathRelative: string): Promise<WcResult> {
  if (isProtectedPath(pathRelative)) {
    throw new Error("wcTool: cannot read protected path");
  }
  const normalized = pathRelative.replace(/\\/g, "/");
  const content = await readWorkspaceFile(normalized);
  const lines = content.split(/\r?\n/).length;
  const words = content.split(/\s+/).filter(Boolean).length;
  const bytes = Buffer.byteLength(content, "utf8");
  return { path: normalized, lines, words, bytes };
}

export interface ReferencedByResult {
  path: string;
  /** File path (stem) used for the search */
  stem: string;
  /** Other files that reference this file (import/require or contain the stem). Excludes the file itself. */
  referencedBy: Array<{ path: string; lineNumber: number; line: string }>;
}

export async function referencedByTool(filePath: string): Promise<ReferencedByResult> {
  if (isProtectedPath(filePath)) {
    throw new Error("referencedByTool: cannot search for protected path");
  }
  const normalized = filePath.replace(/\\/g, "/");
  const base = path.basename(normalized);
  const stem = base.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, "") || base;
  const pattern = "\\b" + escapeRegex(stem) + "\\b";
  const grepResult = await grepTool(".", pattern, { maxMatches: 50 });
  const referencedBy = grepResult.matches
    .filter((m) => m.path !== normalized)
    .map((m) => ({ path: m.path, lineNumber: m.lineNumber, line: m.line }));
  return { path: normalized, stem, referencedBy };
}

