import dotenv from "dotenv";

dotenv.config();

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface QdrantScoredPoint {
  id: string;
  score: number;
  payload?: Record<string, unknown>;
}

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? "repo_chunks";

async function qdrantRequest<T>(
  path: string,
  options: RequestInit,
): Promise<T> {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

export async function ensureCollection(
  vectorSize: number,
  distance: "Cosine" | "Dot" | "Euclid" = "Cosine",
): Promise<void> {
  try {
    await qdrantRequest(`/collections/${QDRANT_COLLECTION}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance,
        },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If the collection already exists, ignore the 409 error.
    if (message.includes("already exists")) {
      return;
    }
    throw err;
  }
}

export async function upsertPoints(points: QdrantPoint[]): Promise<void> {
  if (points.length === 0) return;

  await qdrantRequest(`/collections/${QDRANT_COLLECTION}/points`, {
    method: "PUT",
    body: JSON.stringify({
      points,
    }),
  });
}

export async function deletePointsByFilter(filter: unknown): Promise<void> {
  try {
    await qdrantRequest(`/collections/${QDRANT_COLLECTION}/points/delete`, {
      method: "POST",
      body: JSON.stringify({ filter }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("doesn't exist")) return;
    throw err;
  }
}

export async function searchPoints(
  vector: number[],
  limit: number,
  filter?: unknown,
): Promise<QdrantScoredPoint[]> {
  try {
    const res = await qdrantRequest<{
      result: QdrantScoredPoint[];
    }>(`/collections/${QDRANT_COLLECTION}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit,
        filter,
      }),
    });

    return res.result ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If the collection does not exist yet, just return no results.
    if (message.includes("Collection `repo_chunks` doesn't exist")) {
      return [];
    }
    throw err;
  }
}

