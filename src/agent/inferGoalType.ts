import { ollamaChat } from "../llm/ollamaClient.js";
import type { GoalType } from "../api/schema.js";

const GOAL_TYPES: GoalType[] = [
  "generic",
  "runTestsAndFix",
  "addEndpoint",
  "improveTypes",
];

const INFER_PROMPT = `You are a classifier. Given a user task for a coding agent, reply with exactly one of these words, nothing else: generic, runTestsAndFix, addEndpoint, improveTypes.

- runTestsAndFix: user wants to run tests, fix failing tests, or get tests passing.
- addEndpoint: user wants to add or change an API endpoint, route, or HTTP handler.
- improveTypes: user wants to improve TypeScript types, fix type errors, or add types.
- generic: anything else (refactor, new feature, bugfix, explain, create file, etc.).

Task:
`;

export async function inferGoalType(task: string): Promise<GoalType> {
  const trimmed = task.trim();
  if (!trimmed) return "generic";

  try {
    const { content } = await ollamaChat(
      [{ role: "user", content: INFER_PROMPT + trimmed }],
      { temperature: 0 },
    );
    const word = String(content).trim().toLowerCase().replace(/\s+/g, "");
    const match = GOAL_TYPES.find((g) => word === g.toLowerCase());
    return match ?? "generic";
  } catch {
    return "generic";
  }
}
