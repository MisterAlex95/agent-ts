/**
 * Format conversation history for the planner context.
 */
import type { ConversationMessage } from "../../api/schema.js";

const MAX_HISTORY_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 1500;

export function formatConversationHistory(
  history: ConversationMessage[] | undefined,
): string {
  if (!history?.length) return "";
  const slice = history.slice(-MAX_HISTORY_MESSAGES);
  return slice
    .map((m) => {
      const label = m.role === "user" ? "User" : "Assistant";
      const text = String(m.content ?? "").slice(0, MAX_MESSAGE_LENGTH);
      return (
        label +
        ": " +
        text +
        (String(m.content).length > MAX_MESSAGE_LENGTH ? "…" : "")
      );
    })
    .join("\n\n");
}
