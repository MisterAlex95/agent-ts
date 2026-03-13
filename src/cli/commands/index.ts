/**
 * CLI command: agent index
 * POST /index to index the workspace for RAG.
 */

import { BASE_URL } from "../args.js";
import { logger } from "../../logger.js";

export async function runIndex(): Promise<void> {
  const res = await fetch(`${BASE_URL}/index`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    logger.error("Index failed", { status: res.status, body: text });
    process.exit(1);
  }
  const data = (await res.json()) as { indexedFiles?: number; indexedChunks?: number };
  logger.info("Index completed", {
    indexedFiles: data.indexedFiles ?? 0,
    indexedChunks: data.indexedChunks ?? 0,
  });
}
