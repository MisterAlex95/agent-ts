import { ollamaChat } from "../../llm/ollamaClient.js";
import type { AgentMemorySnapshot } from "../memory/index.js";
import { getResponderSystemPrompt, getResponderUserPrompt } from "../../prompts/responder.js";

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

  const { content } = await ollamaChat(
    [
      { role: "system", content: getResponderSystemPrompt() },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.2 },
  );

  return content.trim();
}
