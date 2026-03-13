import dotenv from "dotenv";
import { logger } from "../logger.js";

dotenv.config();

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatRequest {
  model?: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  stream?: boolean;
}

export interface OllamaChatResponse {
  content: string;
}

export interface OllamaEmbeddingResponse {
  embeddings?: number[][];
  embedding?: number[];
  data?: Array<{ embedding: number[] }>;
}

const AGENT_BASE_URL = process.env.AGENT_BASE_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.AGENT_MODEL ?? "qwen2.5-coder";
const DEFAULT_EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
const LLM_HEADERS_TIMEOUT_MS = Number(
  process.env.AGENT_LLM_HEADERS_TIMEOUT_MS ?? 120_000,
);

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${AGENT_BASE_URL}${path}`;
  logger.debug("LLM POST JSON", { url, hasBody: body != null });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("LLM POST JSON failed", { url, status: res.status, body: text.slice(0, 500) });
    throw new Error(`Ollama request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

export async function ollamaChat(
  messages: OllamaChatMessage[],
  options?: { model?: string; temperature?: number },
): Promise<OllamaChatResponse> {
  return ollamaChatStream(messages, { ...options, onChunk: undefined });
}

export interface OllamaChatStreamOptions {
  model?: string;
  temperature?: number;
  /** Called with each streamed text delta for better perceived latency */
  onChunk?: (delta: string) => void;
}

/**
 * Same as ollamaChat but uses streaming under the hood. Full content is returned
 * after the stream ends so the caller can parse JSON etc. Optionally call onChunk
 * for each delta so the UI can show progress.
 */
export async function ollamaChatStream(
  messages: OllamaChatMessage[],
  options?: OllamaChatStreamOptions,
): Promise<OllamaChatResponse> {
  const model = options?.model ?? DEFAULT_MODEL;
  const temperature = options?.temperature ?? 0.2;
  const onChunk = options?.onChunk;

  const payload: OllamaChatRequest = {
    model,
    messages,
    temperature,
    stream: true,
  };

  const url = `${AGENT_BASE_URL}/api/chat`;
  logger.debug("LLM chat request", {
    url,
    model,
    temperature,
    messagesCount: messages.length,
  });

  let res: Response;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), LLM_HEADERS_TIMEOUT_MS);
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(t);
  } catch (err) {
    logger.error("LLM chat fetch failed", {
      url,
      model,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error("LLM chat HTTP error", {
      url,
      model,
      status: res.status,
      body: text.slice(0, 500),
    });
    throw new Error(`Ollama request failed: ${res.status} ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Ollama response has no body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed) as Record<string, unknown>;
          const content = (data.message as Record<string, unknown>)?.content ?? data.content;
          if (typeof content === "string" && content) {
            fullContent += content;
            onChunk?.(content);
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer.trim()) as Record<string, unknown>;
        const content = (data.message as Record<string, unknown>)?.content ?? data.content;
        if (typeof content === "string" && content) {
          fullContent += content;
          onChunk?.(content);
        }
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent };
}

async function ollamaEmbed(
  inputs: string[],
  options?: { model?: string },
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const model = options?.model ?? DEFAULT_EMBEDDING_MODEL;

  const res = await postJson<OllamaEmbeddingResponse>("/api/embed", {
    model,
    input: inputs.length === 1 ? inputs[0] : inputs,
  });

  if (Array.isArray(res.embeddings)) return res.embeddings;
  if (Array.isArray(res.data)) return res.data.map((d) => d.embedding);
  if (Array.isArray(res.embedding)) return [res.embedding];
  throw new Error("Ollama embed response: missing embeddings array");
}

import type { EmbeddingProvider } from "./embeddingProvider.js";

export function createOllamaEmbeddingProvider(): EmbeddingProvider {
  return {
    embed: (texts: string[], options?: { model?: string }) => ollamaEmbed(texts, options),
  };
}

