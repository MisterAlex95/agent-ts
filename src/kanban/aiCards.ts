/**
 * Ask the LLM to suggest Kanban cards from a user prompt, then create them.
 */
import { getLLMProvider } from "../llm/provider.js";
import { getColumnBySlug } from "../api/kanbanDb.js";
import { createCard } from "../api/kanbanDb.js";
import type { KanbanCardRow } from "../api/kanbanDb.js";
import { logger } from "../logger.js";

const SYSTEM_PROMPT = `You are a task breakdown assistant. The user will describe what Kanban cards they want (e.g. "3 cards for the auth module: add tests, fix login bug, document API").
Reply with ONLY a JSON array of objects. Each object must have:
- "title" (string): short card title
- "description" (string, optional): more details

No markdown, no code fence, no explanation before or after. Only the raw JSON array.
Example: [{"title":"Add unit tests for UserService","description":"Cover login and logout"},{"title":"Fix login redirect"}]`;

function extractJsonArray(raw: string): Array<{ title: string; description?: string }> {
  const trimmed = raw.trim();
  let jsonStr = trimmed;
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  const firstBracket = jsonStr.indexOf("[");
  if (firstBracket >= 0) jsonStr = jsonStr.slice(firstBracket);
  const parsed = JSON.parse(jsonStr) as unknown;
  if (!Array.isArray(parsed)) throw new Error("LLM did not return a JSON array");
  return parsed
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim() : String(item.title ?? "").trim(),
      description: typeof item.description === "string" ? item.description.trim() : undefined,
    }))
    .filter((item) => item.title.length > 0);
}

export async function generateAndCreateAiCards(
  boardId: number,
  prompt: string,
): Promise<{ created: KanbanCardRow[]; error?: string }> {
  const todoCol = getColumnBySlug(boardId, "todo");
  if (!todoCol) {
    return { created: [], error: "Board has no 'todo' column" };
  }

  const llm = getLLMProvider();
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: prompt.trim() || "Suggest 3 to 5 useful tasks for a dev team." },
  ];

  let raw: string;
  try {
    const response = await llm.chat(messages, { temperature: 0.3 });
    raw = response.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("AI cards: LLM call failed", { error: message });
    return { created: [], error: message };
  }

  let items: Array<{ title: string; description?: string }>;
  try {
    items = extractJsonArray(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("AI cards: failed to parse LLM response as JSON", { raw: raw.slice(0, 200), error: message });
    return { created: [], error: "Could not parse AI response as card list. Try a clearer prompt." };
  }

  if (items.length === 0) {
    return { created: [], error: "AI suggested no valid cards." };
  }

  const created: KanbanCardRow[] = [];
  for (const item of items) {
    const card = createCard({
      columnId: todoCol.id,
      title: item.title,
      description: item.description ?? null,
    });
    created.push(card);
  }

  logger.info("AI cards: created", { boardId, count: created.length });
  return { created };
}
