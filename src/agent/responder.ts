import { ollamaChat } from "../llm/ollamaClient.js";
import type { AgentMemorySnapshot } from "./memory.js";

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

  const systemPrompt =
    "You are a senior TypeScript developer agent. Based on the tool calls and their outputs, answer the user's task in a concise way. Respond in English only.";

  const userPrompt = `Task:\n${task}\n\nTool run log:\n${actionsDescription}\n\nProvide a short, direct answer to the task. If the information is insufficient, explain what is missing.`;

  const { content } = await ollamaChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.2 },
  );

  return content.trim();
}

