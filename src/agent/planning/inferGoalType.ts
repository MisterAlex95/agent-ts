import { ollamaChat } from "../../llm/ollamaClient.js";
import type { GoalType } from "../../api/schema.js";
import { getInferGoalTypePrompt } from "../../prompts/infer-goal-type.js";
import { logger } from "../../logger.js";

const GOAL_TYPES: GoalType[] = [
  "generic",
  "runTestsAndFix",
  "addEndpoint",
  "improveTypes",
];

export async function inferGoalType(task: string): Promise<GoalType> {
  const trimmed = task.trim();
  if (!trimmed) return "generic";

  try {
    const prompt = getInferGoalTypePrompt(trimmed);
    const { content } = await ollamaChat(
      [{ role: "user", content: prompt }],
      { temperature: 0 },
    );
    const word = String(content).trim().toLowerCase().replace(/\s+/g, "");
    const match = GOAL_TYPES.find((g) => word === g.toLowerCase());
    return match ?? "generic";
  } catch (error) {
    // Log and fall back to generic so the agent can still run.
    logger.error("[inferGoalType] Failed to infer goal type", {
      task: trimmed,
      error,
    });
    return "generic";
  }
}
