import {
  semanticSearch,
  semanticSearchSymbols,
  SemanticSearchResult,
} from "../rag/search.js";

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

export interface SearchSymbolsResult {
  query: string;
  results: SemanticSearchResult[];
}

export async function searchSymbolsTool(
  query: string,
): Promise<SearchSymbolsResult> {
  const results = await semanticSearchSymbols(query);
  return { query, results };
}

