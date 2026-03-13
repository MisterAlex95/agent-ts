/**
 * CLI command: agent index
 * POST /index to index the workspace for RAG.
 */

import { BASE_URL } from "../args.js";

export async function runIndex(): Promise<void> {
  const res = await fetch(`${BASE_URL}/index`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    console.error("Index failed:", res.status, text);
    process.exit(1);
  }
  const data = (await res.json()) as { indexedFiles?: number; indexedChunks?: number };
  console.log(`Indexed ${data.indexedFiles ?? 0} files, ${data.indexedChunks ?? 0} chunks.`);
}
