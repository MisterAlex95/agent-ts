/**
 * Central config for the agent loop and planner.
 * Tune these to balance context size, token usage, and step efficiency.
 */

export const AGENT_CONFIG = {
  /** Max tool output chars stored per step (observations sent to planner) */
  observationOutputMaxChars: 2000,
  /** How many RAG chunks to keep in relevantContext (last N) */
  maxContextChunks: 3,
  /** When there are more than this many steps, summarize earlier steps as "Tool1, Tool2, ..." and keep only last N full observations */
  observationsSummaryThreshold: 5,
  /** When summarizing, keep this many full observation blocks at the end */
  observationsTailCount: 3,
  /** Initial RAG: max results to inject from task query */
  initialRagMaxResults: 5,
  /** Initial RAG: max chars per result snippet */
  initialRagSnippetChars: 400,
  /** Initial RAG: max chars of task used as query */
  initialRagQueryMaxChars: 400,
  /** Search result chunks: max snippet chars when appending to relevantContext after searchCode/searchSymbols */
  searchChunkSnippetChars: 500,
  /** Search result chunks: max results to append per search call */
  searchChunkMaxResults: 8,
} as const;
