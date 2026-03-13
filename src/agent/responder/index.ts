import { ollamaChat } from "../../llm/ollamaClient.js";
import type { AgentMemorySnapshot } from "../memory/index.js";
import { getResponderSystemPrompt, getResponderUserPrompt } from "../../prompts/responder.js";
import { logger } from "../../logger.js";

export async function summarizeRun(
  task: string,
  memory: AgentMemorySnapshot,
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
    const { content } = await ollamaChat(
      [
        { role: "system", content: getResponderSystemPrompt() },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2 },
    );

    return content.trim();
  } catch (error) {
    logger.error("[summarizeRun] Failed to generate run summary", {
      task,
      error,
    });
    // Fallback: at least return the raw actions so the caller sees something.
    return `Summary failed due to an error. Raw actions:\n\n${actionsDescription}`;
  }
}
