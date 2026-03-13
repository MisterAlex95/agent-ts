import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, "templates");
nunjucks.configure(templatesDir, { autoescape: false });

export interface PlanningContext {
  task: string;
  recentObservations: string;
  relevantContext: string;
  goalType: "generic" | "runTestsAndFix" | "addEndpoint" | "improveTypes";
  conversationHistory?: string;
  alreadyReadPaths?: string;
  alreadyListedPaths?: string;
  /** Steps left in this run (for countdown / prefer progress) */
  stepsRemaining?: number;
  maxSteps?: number;
}

export function getPlannerAskModePrompt(toolsList: string): string {
  return nunjucks.render("planner-ask.njk", { toolsList });
}

export function getPlannerSystemPrompt(toolsList: string): string {
  return nunjucks.render("planner-system.njk", { toolsList });
}

export function getPlannerUserPrompt(ctx: PlanningContext): string {
  return nunjucks.render("planner-user.njk", ctx);
}

export const PLANNER_RETRY_PROMPT =
  "Your previous response was not valid. Reply with ONLY one JSON object: {\"tool\":\"toolName\",\"params\":{...}} or {\"tool\":\"DONE\",\"params\":{}}. No markdown, no explanation.";

export const PLANNER_FALLBACK_PROMPT =
  "Reply with ONLY one JSON object: {\"tool\":\"toolName\",\"params\":{...}} or {\"tool\":\"DONE\",\"params\":{}}. No other text.";
