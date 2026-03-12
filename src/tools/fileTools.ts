import {
  getWorkspaceRoot,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../runtime/workspaceManager.js";
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

const PROTECTED_PATH_PATTERNS: RegExp[] = [
  /^\.git(?:\/|$)/,
  /^node_modules(?:\/|$)/,
  /^dist(?:\/|$)/,
  /^build(?:\/|$)/,
  /^.*\.log$/i,
];

function isProtectedPath(pathRelative: string): boolean {
  const normalized = pathRelative.replace(/\\/g, "/");
  return PROTECTED_PATH_PATTERNS.some((re) => re.test(normalized));
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
    await writeWorkspaceFile(pathRelative, updated);
  }

  return {
    path: pathRelative.replace(/\\/g, "/"),
    previousContentSnippet: original.slice(0, 2000),
    newContentSnippet: updated.slice(0, 2000),
    appliedOperations: applied,
  };
}

