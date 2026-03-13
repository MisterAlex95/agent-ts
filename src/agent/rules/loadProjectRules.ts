/**
 * Load project-scoped rules from .agent/rules/ or AGENTS.md for planner context.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { getWorkspaceRoot } from "../../runtime/workspaceManager.js";

const RULES_DIR = ".agent/rules";
const AGENTS_MD = "AGENTS.md";
const MAX_PROJECT_RULES_CHARS = 8000;

export async function loadProjectRules(): Promise<string> {
  const root = getWorkspaceRoot();
  const parts: string[] = [];

  try {
    const rulesDir = path.join(root, RULES_DIR);
    let entries: string[];
    try {
      entries = await fs.readdir(rulesDir);
    } catch {
      entries = [];
    }
    for (const name of entries.sort()) {
      const fullPath = path.join(rulesDir, name);
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) continue;
        const content = await fs.readFile(fullPath, "utf8");
        const trimmed = content.trim();
        if (trimmed) {
          parts.push(`--- ${name}\n${trimmed}`);
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // no .agent/rules
  }

  try {
    const agentsPath = path.join(root, AGENTS_MD);
    const content = await fs.readFile(agentsPath, "utf8");
    const trimmed = content.trim();
    if (trimmed) {
      parts.push(`--- ${AGENTS_MD}\n${trimmed}`);
    }
  } catch {
    // no AGENTS.md
  }

  if (parts.length === 0) return "";
  const combined = parts.join("\n\n");
  if (combined.length <= MAX_PROJECT_RULES_CHARS) return combined;
  return combined.slice(0, MAX_PROJECT_RULES_CHARS) + "\n\n[... truncated]";
}
