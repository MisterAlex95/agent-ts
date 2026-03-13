import { getEmbeddingProvider } from "./embeddingProvider.js";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return getEmbeddingProvider().embed(texts);
}

