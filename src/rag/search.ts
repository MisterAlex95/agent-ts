import { embedTexts } from "./embeddings.js";
import { searchPoints, QdrantScoredPoint } from "./qdrantClient.js";

export interface SemanticSearchResult {
  score: number;
  filePath: string;
  language: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
  kind?: "function" | "class" | "endpoint";
  content: string;
}

export async function semanticSearch(
  query: string,
  options?: { limit?: number },
): Promise<SemanticSearchResult[]> {
  const vectors = await embedTexts([query]);
  const vector = Array.isArray(vectors) ? vectors[0] : undefined;
  if (!vector || !Array.isArray(vector)) return [];

  const limit = options?.limit ?? 16;
  const results: QdrantScoredPoint[] = await searchPoints(vector, limit);

  return results
    .map((r) => mapPayloadToResult(r))
    .filter((r) => r.filePath.length > 0);
}

function mapPayloadToResult(r: QdrantScoredPoint): SemanticSearchResult {
  const payload = r.payload ?? {};
  const kind = payload.kind as string | undefined;
  const validKind =
    kind === "function" || kind === "class" || kind === "endpoint"
      ? kind
      : undefined;
  return {
    score: r.score,
    filePath: String(payload.filePath ?? ""),
    language: String(payload.language ?? ""),
    startLine:
      typeof payload.startLine === "number"
        ? (payload.startLine as number)
        : undefined,
    endLine:
      typeof payload.endLine === "number"
        ? (payload.endLine as number)
        : undefined,
    symbol:
      typeof payload.symbol === "string"
        ? (payload.symbol as string)
        : undefined,
    kind: validKind,
    content: String(payload.content ?? ""),
  } as SemanticSearchResult;
}

const SYMBOL_FILTER = {
  must_not: [{ is_null: { key: "symbol" } }],
} as const;

export async function semanticSearchSymbols(
  query: string,
  options?: { limit?: number },
): Promise<SemanticSearchResult[]> {
  const vectors = await embedTexts([query]);
  const vector = Array.isArray(vectors) ? vectors[0] : undefined;
  if (!vector || !Array.isArray(vector)) return [];

  const limit = options?.limit ?? 16;
  const results: QdrantScoredPoint[] = await searchPoints(
    vector,
    limit,
    SYMBOL_FILTER,
  );

  return results
    .map((r) => mapPayloadToResult(r))
    .filter((r) => r.filePath.length > 0 && r.symbol != null);
}

