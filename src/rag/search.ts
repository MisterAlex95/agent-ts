import { embedTexts } from "./embeddings.js";
import { searchPoints, scrollPoints, QdrantScoredPoint } from "./qdrantClient.js";

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
  let vector: number[] | undefined;
  try {
    const vectors = await embedTexts([query]);
    vector = Array.isArray(vectors) ? vectors[0] : undefined;
  } catch {
    return [];
  }
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
  let vector: number[] | undefined;
  try {
    const vectors = await embedTexts([query]);
    vector = Array.isArray(vectors) ? vectors[0] : undefined;
  } catch {
    return [];
  }
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

const KEYWORD_SCROLL_LIMIT = 500;
const KEYWORD_MATCH_SCORE = 0.6;

function mapPayloadToResultFromPoint(point: {
  payload?: Record<string, unknown>;
}): SemanticSearchResult | null {
  const payload = point.payload ?? {};
  const filePath = String(payload.filePath ?? "");
  if (!filePath) return null;
  const kind = payload.kind as string | undefined;
  const validKind =
    kind === "function" || kind === "class" || kind === "endpoint"
      ? kind
      : undefined;
  return {
    score: KEYWORD_MATCH_SCORE,
    filePath,
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
      typeof payload.symbol === "string" ? (payload.symbol as string) : undefined,
    kind: validKind,
    content: String(payload.content ?? ""),
  };
}

async function keywordSearchInChunks(
  query: string,
  limit: number,
): Promise<SemanticSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const results: SemanticSearchResult[] = [];
  let offset: string | number | null = null;

  for (let i = 0; i < 3; i++) {
    const { points, nextPageOffset } = await scrollPoints(
      KEYWORD_SCROLL_LIMIT,
      offset,
    );
    for (const point of points) {
      const content = String((point.payload ?? {}).content ?? "").toLowerCase();
      const matches = words.every((w) => content.includes(w));
      if (matches) {
        const r = mapPayloadToResultFromPoint(point);
        if (r) results.push(r);
        if (results.length >= limit) break;
      }
    }
    if (results.length >= limit) break;
    offset = nextPageOffset;
    if (offset == null) break;
  }

  return results.slice(0, limit);
}

export async function hybridSearch(
  query: string,
  options?: { limit?: number },
): Promise<SemanticSearchResult[]> {
  const limit = options?.limit ?? 16;
  const semanticLimit = Math.ceil(limit * 0.75);
  const keywordLimit = Math.ceil(limit * 0.5);

  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(query, { limit: semanticLimit }),
    keywordSearchInChunks(query, keywordLimit),
  ]);

  const seen = new Set<string>();
  const merged: SemanticSearchResult[] = [];
  for (const r of semanticResults) {
    const key = `${r.filePath}:${r.startLine ?? 0}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }
  for (const r of keywordResults) {
    const key = `${r.filePath}:${r.startLine ?? 0}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  return merged.slice(0, limit);
}

