import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { getWorkspaceRoot, listWorkspaceFiles, readWorkspaceFile } from "../runtime/workspaceManager.js";
import { embedTexts } from "./embeddings.js";
import { ensureCollection, upsertPoints, deletePointsByFilter, QdrantPoint } from "./qdrantClient.js";

const INDEX_STATE_FILENAME = ".agent-index-state.json";

export interface IndexState {
  files: Record<string, number>;
}

async function readIndexState(): Promise<IndexState | null> {
  const statePath = path.join(getWorkspaceRoot(), INDEX_STATE_FILENAME);
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const data = JSON.parse(raw) as IndexState;
    return data?.files && typeof data.files === "object" ? data : null;
  } catch {
    return null;
  }
}

async function writeIndexState(state: IndexState): Promise<void> {
  const statePath = path.join(getWorkspaceRoot(), INDEX_STATE_FILENAME);
  await fs.writeFile(statePath, JSON.stringify(state, null, 0), "utf8");
}

async function getFileMtimes(relativePaths: string[]): Promise<Map<string, number>> {
  const root = getWorkspaceRoot();
  const out = new Map<string, number>();
  for (const rel of relativePaths) {
    const full = path.join(root, rel.replace(/\//g, path.sep));
    try {
      const stat = await fs.stat(full);
      out.set(rel.replace(/\\/g, "/"), stat.mtimeMs);
    } catch {
      // file gone or unreadable
    }
  }
  return out;
}

const MAX_FILE_BYTES = 500_000;
const MAX_FILE_LINES = 15_000;
const MAX_JSON_LINES = 2_000;

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".next",
  ".nuxt",
]);
const IGNORED_EXT = new Set([".log", ".lock", ".map", ".min.js", ".min.css"]);
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".pdf", ".zip", ".tar", ".gz"]);

export interface CodeChunkMetadata {
  filePath: string;
  language: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
  kind?: "function" | "class" | "endpoint";
}

export interface CodeChunk {
  id: string;
  content: string;
  metadata: CodeChunkMetadata;
}

export interface ExtractedSymbol {
  name: string;
  kind: "function" | "class" | "endpoint";
  startLine: number;
  endLine: number;
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".js" || ext === ".jsx") return "javascript";
  if (ext === ".json") return "json";
  if (ext === ".md") return "markdown";
  if (ext === ".py") return "python";
  return "text";
}

function shouldIndexFile(relativePath: string, content: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  for (const part of parts) {
    if (IGNORED_DIRS.has(part)) return false;
  }
  const ext = path.extname(relativePath).toLowerCase();
  if (IGNORED_EXT.has(ext) || BINARY_EXT.has(ext)) return false;
  if (content.length > MAX_FILE_BYTES) return false;
  const lineCount = content.split(/\r?\n/).length;
  if (lineCount > MAX_FILE_LINES) return false;
  if (ext === ".json" && lineCount > MAX_JSON_LINES) return false;
  return true;
}

function extractSymbols(content: string, filePath: string): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const lines = content.split(/\r?\n/);
  const lang = detectLanguage(filePath);
  const isJsLike = lang === "typescript" || lang === "javascript" || lang === "text";

  if (!isJsLike) return symbols;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    const classMatch = line.match(/\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[{]?/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: "class",
        startLine: lineNo,
        endLine: lineNo,
      });
      continue;
    }

    const funcDecl = line.match(/\b(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
    if (funcDecl) {
      symbols.push({
        name: funcDecl[1],
        kind: "function",
        startLine: lineNo,
        endLine: lineNo,
      });
      continue;
    }

    const arrowAssign = line.match(/(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
    if (arrowAssign) {
      symbols.push({
        name: arrowAssign[1],
        kind: "function",
        startLine: lineNo,
        endLine: lineNo,
      });
      continue;
    }

    const methodLike = line.match(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*:\s*(?:Promise<[^>]+>|[A-Za-z{}[\]]+)\s*\{/);
    if (methodLike && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*")) {
      const name = methodLike[1];
      if (!["if", "for", "while", "switch", "catch"].includes(name)) {
        symbols.push({
          name,
          kind: "function",
          startLine: lineNo,
          endLine: lineNo,
        });
      }
      continue;
    }

    const fastifyRoute = line.match(/\.(get|post|put|patch|delete|options)\s*\(\s*["'`]([^"'`]+)["'`]/);
    if (fastifyRoute) {
      symbols.push({
        name: `${fastifyRoute[1].toUpperCase()} ${fastifyRoute[2]}`,
        kind: "endpoint",
        startLine: lineNo,
        endLine: lineNo,
      });
      continue;
    }

    const expressRoute = line.match(/(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/);
    if (expressRoute) {
      symbols.push({
        name: `${expressRoute[1].toUpperCase()} ${expressRoute[2]}`,
        kind: "endpoint",
        startLine: lineNo,
        endLine: lineNo,
      });
    }
  }

  return symbols;
}

function splitCodeIntoChunks(
  filePath: string,
  content: string,
  maxLines = 80,
): CodeChunk[] {
  const lines = content.split(/\r?\n/);
  const symbols = extractSymbols(content, filePath);
  const chunks: CodeChunk[] = [];
  let currentStart = 0;

  while (currentStart < lines.length) {
    const end = Math.min(currentStart + maxLines, lines.length);
    const chunkLines = lines.slice(currentStart, end);
    const id = crypto.randomUUID();

    const chunkStartLine = currentStart + 1;
    const chunkEndLine = end;
    const symbolInChunk = symbols.find(
      (s) => s.startLine >= chunkStartLine && s.startLine <= chunkEndLine,
    );

    const metadata: CodeChunkMetadata = {
      filePath,
      language: detectLanguage(filePath),
      startLine: chunkStartLine,
      endLine: chunkEndLine,
      ...(symbolInChunk
        ? { symbol: symbolInChunk.name, kind: symbolInChunk.kind }
        : {}),
    };

    chunks.push({
      id,
      content: chunkLines.join("\n"),
      metadata,
    });

    currentStart = end;
  }

  return chunks;
}

export async function indexWorkspaceRepository(): Promise<{
  indexedFiles: number;
  indexedChunks: number;
}> {
  const files = await listWorkspaceFiles(".");
  const codeFiles = files.filter((f) => {
    const normalized = f.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return !parts.some((p) => IGNORED_DIRS.has(p));
  });

  const allChunks: CodeChunk[] = [];
  let indexedFileCount = 0;

  for (const file of codeFiles) {
    const content = await readWorkspaceFile(file);
    if (!shouldIndexFile(file, content)) continue;
    indexedFileCount++;
    const chunks = splitCodeIntoChunks(file, content);
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) {
    return { indexedFiles: indexedFileCount, indexedChunks: 0 };
  }

  const texts = allChunks.map((c) => c.content);
  const vectors = await embedTexts(texts);

  if (vectors.length !== allChunks.length) {
    throw new Error("Embeddings count does not match chunks count");
  }

  await ensureCollection(vectors[0].length);

  const points: QdrantPoint[] = allChunks.map((chunk, idx) => ({
    id: chunk.id,
    vector: vectors[idx],
    payload: {
      filePath: chunk.metadata.filePath,
      language: chunk.metadata.language,
      startLine: chunk.metadata.startLine,
      endLine: chunk.metadata.endLine,
      symbol: chunk.metadata.symbol ?? null,
      kind: chunk.metadata.kind ?? null,
      content: chunk.content,
    },
  }));

  await upsertPoints(points);
  await writeIndexStateAfterFullIndex();

  return {
    indexedFiles: indexedFileCount,
    indexedChunks: allChunks.length,
  };
}

export async function removeFileFromIndex(relativePath: string): Promise<void> {
  const normalized = relativePath.replace(/\\/g, "/");
  await deletePointsByFilter({
    must: [{ key: "filePath", match: { value: normalized } }],
  });
}

export async function indexWorkspaceFiles(
  relativePaths: string[],
): Promise<{ indexedFiles: number; indexedChunks: number }> {
  if (relativePaths.length === 0) {
    return { indexedFiles: 0, indexedChunks: 0 };
  }
  const normalizedPaths = relativePaths.map((p) => p.replace(/\\/g, "/"));
  await deletePointsByFilter({
    must: [{ key: "filePath", match: { any: normalizedPaths } }],
  });

  const allChunks: CodeChunk[] = [];
  for (const filePath of normalizedPaths) {
    try {
      const content = await readWorkspaceFile(filePath);
      if (!shouldIndexFile(filePath, content)) continue;
      const chunks = splitCodeIntoChunks(filePath, content);
      allChunks.push(...chunks);
    } catch {
      continue;
    }
  }

  if (allChunks.length === 0) {
    return { indexedFiles: 0, indexedChunks: 0 };
  }

  const texts = allChunks.map((c) => c.content);
  const vectors = await embedTexts(texts);
  if (vectors.length !== allChunks.length) {
    throw new Error("Embeddings count does not match chunks count");
  }
  await ensureCollection(vectors[0].length);

  const points: QdrantPoint[] = allChunks.map((chunk, idx) => ({
    id: chunk.id,
    vector: vectors[idx],
    payload: {
      filePath: chunk.metadata.filePath,
      language: chunk.metadata.language,
      startLine: chunk.metadata.startLine,
      endLine: chunk.metadata.endLine,
      symbol: chunk.metadata.symbol ?? null,
      kind: chunk.metadata.kind ?? null,
      content: chunk.content,
    },
  }));
  await upsertPoints(points);

  const indexedFiles = new Set(allChunks.map((c) => c.metadata.filePath)).size;
  return { indexedFiles, indexedChunks: allChunks.length };
}

function getCodeFilePaths(files: string[]): string[] {
  return files.filter((f) => {
    const normalized = f.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return !parts.some((p) => IGNORED_DIRS.has(p));
  });
}

export async function indexWorkspaceIncremental(): Promise<{
  indexedFiles: number;
  indexedChunks: number;
  removed: number;
  unchanged: number;
}> {
  const state = await readIndexState();
  if (!state?.files || Object.keys(state.files).length === 0) {
    const full = await indexWorkspaceRepository();
    return {
      indexedFiles: full.indexedFiles,
      indexedChunks: full.indexedChunks,
      removed: 0,
      unchanged: 0,
    };
  }

  const files = await listWorkspaceFiles(".");
  const codePaths = getCodeFilePaths(files);
  const mtimes = await getFileMtimes(codePaths);

  const currentByPath = new Map(mtimes.entries());
  const prev = state?.files ?? {};
  const deleted: string[] = [];
  const changedOrNew: string[] = [];

  for (const p of Object.keys(prev)) {
    if (!currentByPath.has(p)) deleted.push(p);
  }
  for (const p of codePaths) {
    const norm = p.replace(/\\/g, "/");
    const mt = currentByPath.get(norm);
    if (mt == null) continue;
    const prevMt = prev[norm];
    if (prevMt !== mt) changedOrNew.push(norm);
  }

  for (const p of deleted) {
    await removeFileFromIndex(p);
  }

  let indexedFiles = 0;
  let indexedChunks = 0;
  if (changedOrNew.length > 0) {
    const result = await indexWorkspaceFiles(changedOrNew);
    indexedFiles = result.indexedFiles;
    indexedChunks = result.indexedChunks;
  }

  const newState: IndexState = {
    files: {},
  };
  for (const p of codePaths) {
    const norm = p.replace(/\\/g, "/");
    const mt = currentByPath.get(norm);
    if (mt != null) newState.files[norm] = mt;
  }
  await writeIndexState(newState);

  const unchanged = codePaths.length - changedOrNew.length - deleted.length;
  return {
    indexedFiles,
    indexedChunks,
    removed: deleted.length,
    unchanged: unchanged > 0 ? unchanged : 0,
  };
}

export async function writeIndexStateAfterFullIndex(): Promise<void> {
  const files = await listWorkspaceFiles(".");
  const codePaths = getCodeFilePaths(files);
  const mtimes = await getFileMtimes(codePaths);
  const state: IndexState = {
    files: Object.fromEntries(mtimes.entries()),
  };
  await writeIndexState(state);
}

