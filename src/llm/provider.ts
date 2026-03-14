/**
 * LLM provider abstraction: selects implementation from env (default Ollama).
 * Set AGENT_LLM_PROVIDER=pi to use @mariozechner/pi-ai (multi-provider, native tool calling).
 */
import type { LLMProvider } from "./types.js";
import {
  ollamaChat,
  ollamaChatStream,
  type OllamaChatMessage,
} from "./ollamaClient.js";
import { piAiProvider } from "./piAiProvider.js";

import type { LLMMessage } from "./types.js";

function toOllamaMessages(messages: LLMMessage[]): OllamaChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

const ollamaProvider: LLMProvider = {
  async chat(messages, options) {
    return ollamaChat(toOllamaMessages(messages), {
      model: options?.model,
      temperature: options?.temperature,
      seed: options?.seed,
      top_p: options?.top_p,
      top_k: options?.top_k,
    });
  },
  async chatStream(messages, options) {
    return ollamaChatStream(toOllamaMessages(messages), {
      model: options?.model,
      temperature: options?.temperature,
      seed: options?.seed,
      top_p: options?.top_p,
      top_k: options?.top_k,
      onChunk: options?.onChunk,
      signal: options?.signal,
    });
  },
};

const PROVIDER_ENV = process.env.AGENT_LLM_PROVIDER?.toLowerCase() ?? "ollama";

export function getLLMProvider(): LLMProvider {
  if (PROVIDER_ENV === "pi") return piAiProvider;
  return ollamaProvider;
}
