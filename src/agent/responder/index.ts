import { getLLMProvider } from "../../llm/provider.js";
import type { AgentMemorySnapshot } from "../memory/index.js";
import { getResponderSystemPrompt, getResponderUserPrompt } from "../../prompts/responder.js";
import { logger } from "../../logger.js";

export interface SummarizeRunOptions {
  onChunk?: (delta: string) => void;
  signal?: AbortSignal;
  seed?: number;
}

export async function summarizeRun(
  task: string,
  memory: AgentMemorySnapshot,
  options?: SummarizeRunOptions,
): Promise<string> {
  const actionsDescription =
    memory.actions
      .map(
        (a, index) =>
          `Step ${index + 1} - tool: ${a.tool}\ninput: ${JSON.stringify(
            a.input,
          )}\noutput: ${JSON.stringify(a.output).slice(0, 1500)}`,
      )
      .join("\n\n") || "(no actions executed)";

  const userPrompt = getResponderUserPrompt(task, actionsDescription);

  try {
    const llm = getLLMProvider();
    const { content } = await llm.chatStream(
      [
        { role: "system", content: getResponderSystemPrompt() },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.2,
        seed: options?.seed ?? 42,
        onChunk: options?.onChunk,
        signal: options?.signal,
      },
    );

    return content.trim();
  } catch (error) {
    logger.error("[summarizeRun] Failed to generate run summary", {
      task,
      error,
    });
    return `Summary failed due to an error. Raw actions:\n\n${actionsDescription}`;
  }
}
