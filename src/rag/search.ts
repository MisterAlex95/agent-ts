import { embedTexts } from "./embeddings.js";
import { searchPoints, QdrantScoredPoint } from "./qdrantClient.js";

export interface SemanticSearchResult {
  score: number;
  filePath: string;
  language: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
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
    .map((r) => {
      const payload = r.payload ?? {};
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
        content: String(payload.content ?? ""),
      } as SemanticSearchResult;
    })
    .filter((r) => r.filePath.length > 0);
}

