import { createOllamaEmbeddingProvider } from "../llm/ollamaClient.js";
import type { EmbeddingProvider } from "../llm/embeddingProvider.js";

export type { EmbeddingProvider } from "../llm/embeddingProvider.js";

export type EmbeddingProviderName = "ollama" | "openai" | "claude";

const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER ?? "ollama") as EmbeddingProviderName;

let cachedProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (cachedProvider) return cachedProvider;
  switch (EMBEDDING_PROVIDER) {
    case "ollama":
      cachedProvider = createOllamaEmbeddingProvider();
      break;
    case "openai":
    case "claude":
      throw new Error(
        `Embedding provider "${EMBEDDING_PROVIDER}" is not implemented yet. Add src/llm/${EMBEDDING_PROVIDER}Client.ts and wire it in src/rag/embeddingProvider.ts.`,
      );
    default:
      throw new Error(
        `Unknown EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER}. Use ollama, openai, or claude.`,
      );
  }
  return cachedProvider;
}

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  cachedProvider = provider;
}
