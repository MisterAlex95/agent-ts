import { semanticSearchSymbols, type SemanticSearchResult } from "../../rag/search.js";

export interface SearchSymbolsResult {
  query: string;
  results: SemanticSearchResult[];
}

export async function searchSymbolsTool(query: string): Promise<SearchSymbolsResult> {
  const results = await semanticSearchSymbols(query);
  return { query, results };
}
