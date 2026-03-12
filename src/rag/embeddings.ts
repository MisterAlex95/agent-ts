import { ollamaEmbed } from "../llm/ollamaClient.js";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return ollamaEmbed(texts);
}

