import dotenv from "dotenv";

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

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder";
const DEFAULT_EMBEDDING_MODEL =
  process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${OLLAMA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

export async function ollamaChat(
  messages: OllamaChatMessage[],
  options?: { model?: string; temperature?: number },
): Promise<OllamaChatResponse> {
  const model = options?.model ?? DEFAULT_MODEL;
  const temperature = options?.temperature ?? 0.2;

  const payload: OllamaChatRequest = {
    model,
    messages,
    temperature,
    stream: false,
  };

  // Ollama's /api/chat streams; for simplicity we assume a compatible non-streaming endpoint or adapt as needed.
  const res = await postJson<any>("/api/chat", payload);

  if (typeof res.message?.content === "string") {
    return { content: res.message.content };
  }

  if (typeof res.content === "string") {
    return { content: res.content };
  }

  throw new Error("Unexpected Ollama chat response format");
}

export async function ollamaEmbed(
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

