export interface EmbeddingProvider {
  embed(texts: string[], options?: { model?: string }): Promise<number[][]>;
}
