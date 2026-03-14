/**
 * LLM provider backed by @mariozechner/pi-ai.
 * Uses OpenAI-compatible API (Ollama, vLLM, or any provider via getModel when available).
 * When AGENT_LLM_PROVIDER=pi, this provider is used for multi-provider and native tool-call support.
 */
import { stream, complete, type Context, type Model, type Message } from "@mariozechner/pi-ai";
import type { LLMProvider } from "./types.js";
import type { LLMMessage } from "./types.js";
import { logger } from "../logger.js";

const AGENT_BASE_URL = process.env.AGENT_BASE_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.AGENT_MODEL ?? "qwen2.5-coder";

function getBaseUrl(): string {
  const base = AGENT_BASE_URL.trim();
  return base.endsWith("/v1") ? base : `${base.replace(/\/$/, "")}/v1`;
}

/**
 * Build an OpenAI-compatible model config from env (Ollama, vLLM, LM Studio, etc.).
 */
export function getPiModel(): Model<"openai-completions"> {
  return {
    id: DEFAULT_MODEL,
    name: `Ollama ${DEFAULT_MODEL}`,
    api: "openai-completions",
    provider: "ollama",
    baseUrl: getBaseUrl(),
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 32_000,
  };
}

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function toPiContext(messages: LLMMessage[], model: Model<"openai-completions">): Context {
  const systemParts: string[] = [];
  const chatMessages: Message[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else if (m.role === "user") {
      chatMessages.push({
        role: "user",
        content: m.content,
        timestamp: Date.now(),
      });
    } else {
      chatMessages.push({
        role: "assistant",
        content: [{ type: "text", text: m.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: ZERO_USAGE,
        stopReason: "stop",
        timestamp: Date.now(),
      });
    }
  }

  return {
    systemPrompt: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: chatMessages,
  };
}

function extractTextFromMessage(message: { content: Array<{ type: string; text?: string }> }): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

const piAiProvider: LLMProvider = {
  async chat(messages, options) {
    const model = getPiModel();
    const context = toPiContext(messages, model);
    const response = await complete(model, context, {
      apiKey: "dummy",
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.seed !== undefined && { seed: options.seed }),
    });
    const text = extractTextFromMessage(response);
    return { content: text };
  },

  async chatStream(messages, options) {
    const model = getPiModel();
    const context = toPiContext(messages, model);
    const onChunk = options?.onChunk;
    const streamOptions = {
      apiKey: "dummy",
      signal: options?.signal,
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.seed !== undefined && { seed: options.seed }),
    };

    const s = stream(model, context, streamOptions);
    let fullContent = "";

    try {
      for await (const event of s) {
        if (event.type === "text_delta") {
          fullContent += event.delta;
          onChunk?.(event.delta);
        }
        if (event.type === "error") {
          logger.error("[pi-ai] stream error", {
            reason: event.reason,
            errorMessage: event.error?.errorMessage ?? String(event.error),
          });
          throw new Error(event.error?.errorMessage ?? `pi-ai stream error: ${event.reason}`);
        }
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        return { content: fullContent, partial: true };
      }
      throw err;
    }

    const result = await s.result();
    const finalText = result?.content
      ? extractTextFromMessage(result as { content: Array<{ type: string; text?: string }> })
      : fullContent;
    const partial = result?.stopReason === "aborted";

    return {
      content: finalText || fullContent,
      ...(partial && { partial: true }),
    };
  },
};

export { piAiProvider, toPiContext };
