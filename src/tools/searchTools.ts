import { semanticSearch, SemanticSearchResult } from "../rag/search.js";

export interface SearchCodeResult {
  query: string;
  results: SemanticSearchResult[];
}

export async function searchCodeTool(
  query: string,
): Promise<SearchCodeResult> {
  const results = await semanticSearch(query);
  return { query, results };
}

