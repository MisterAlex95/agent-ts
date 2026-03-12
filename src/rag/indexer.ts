import path from "node:path";
import crypto from "node:crypto";
import { listWorkspaceFiles, readWorkspaceFile } from "../runtime/workspaceManager.js";
import { embedTexts } from "./embeddings.js";
import { ensureCollection, upsertPoints, QdrantPoint } from "./qdrantClient.js";

export interface CodeChunkMetadata {
  filePath: string;
  language: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
}

export interface CodeChunk {
  id: string;
  content: string;
  metadata: CodeChunkMetadata;
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

function splitCodeIntoChunks(
  filePath: string,
  content: string,
  maxLines = 80,
): CodeChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: CodeChunk[] = [];
  let currentStart = 0;

  while (currentStart < lines.length) {
    const end = Math.min(currentStart + maxLines, lines.length);
    const chunkLines = lines.slice(currentStart, end);
    const id = crypto.randomUUID();

    const metadata: CodeChunkMetadata = {
      filePath,
      language: detectLanguage(filePath),
      startLine: currentStart + 1,
      endLine: end,
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
  const codeFiles = files.filter((f) => !f.includes("node_modules"));

  const allChunks: CodeChunk[] = [];

  for (const file of codeFiles) {
    const content = await readWorkspaceFile(file);
    const chunks = splitCodeIntoChunks(file, content);
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) {
    return { indexedFiles: codeFiles.length, indexedChunks: 0 };
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
      symbol: chunk.metadata.symbol,
      content: chunk.content,
    },
  }));

  await upsertPoints(points);

  return {
    indexedFiles: codeFiles.length,
    indexedChunks: allChunks.length,
  };
}

