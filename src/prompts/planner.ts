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
  /** Paths to prioritize (user focus) */
  focusPaths?: string[];
  alreadyReadPaths?: string;
  alreadyListedPaths?: string;
  /** Steps left in this run (for countdown / prefer progress) */
  stepsRemaining?: number;
  maxSteps?: number;
  /** True if at least one write was already run this run */
  hasPerformedWrite?: boolean;
}

export function getPlannerAskModePrompt(
  toolsList: string,
  projectRules?: string,
): string {
  return nunjucks.render("planner-ask.njk", {
    toolsList,
    projectRules: projectRules || undefined,
  });
}

export function getPlannerSystemPrompt(
  toolsList: string,
  projectRules?: string,
): string {
  return nunjucks.render("planner-system.njk", {
    toolsList,
    projectRules: projectRules || undefined,
  });
}

export function getPlannerUserPrompt(ctx: PlanningContext): string {
  return nunjucks.render("planner-user.njk", ctx);
}

export const PLANNER_RETRY_PROMPT =
  "Your previous response was not valid. Reply with ONLY one JSON object: {\"tool\":\"toolName\",\"params\":{...}} or {\"tool\":\"DONE\",\"params\":{}}. No markdown, no code fences, no explanation before or after.";

export const PLANNER_FALLBACK_PROMPT =
  "Reply with ONLY one JSON object: {\"tool\":\"toolName\",\"params\":{...}} or {\"tool\":\"DONE\",\"params\":{}}. No other text. Raw JSON only.";
