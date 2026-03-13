import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, "templates");
nunjucks.configure(templatesDir, { autoescape: false });

export function getInferGoalTypePrompt(task: string): string {
  return nunjucks.render("infer-goal-type.njk", { task });
}

