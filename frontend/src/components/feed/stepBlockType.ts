/**
 * Categorize a step by tool for feed block rendering.
 */
export type StepBlockType = "exploration" | "file_change" | "command" | "other";

const EXPLORATION_TOOLS = new Set([
  "listFiles",
  "readFile",
  "readFiles",
  "searchCode",
  "searchSymbols",
]);

const FILE_CHANGE_TOOLS = new Set([
  "writeFile",
  "searchReplace",
  "appendFile",
  "editLines",
]);

const COMMAND_TOOLS = new Set([
  "runCommand",
  "runTests",
  "runLint",
  "runBuild",
]);

export function getStepBlockType(tool: string | undefined): StepBlockType {
  if (!tool) return "other";
  if (EXPLORATION_TOOLS.has(tool)) return "exploration";
  if (FILE_CHANGE_TOOLS.has(tool)) return "file_change";
  if (COMMAND_TOOLS.has(tool)) return "command";
  return "other";
}
