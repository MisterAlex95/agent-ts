/**
 * Minimal LLM provider interface for planner and responder.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  model?: string;
  temperature?: number;
  seed?: number;
  top_p?: number;
  top_k?: number;
}

export interface LLMChatStreamOptions extends LLMChatOptions {
  onChunk?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface LLMChatResponse {
  content: string;
  /** True when the stream was aborted and content is partial */
  partial?: boolean;
}

export interface LLMProvider {
  chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMChatResponse>;
  chatStream(
    messages: LLMMessage[],
    options?: LLMChatStreamOptions,
  ): Promise<LLMChatResponse>;
}
