/**
 * CLI usage / help text.
 */
import { logger } from "../logger.js";

export function printUsage(): void {
  logger.info(
    "CLI usage",
    {
      usage: `
Usage:
  agent index
  agent run "Task description" [--max-steps N] [--mode MODE] [--goal-type TYPE] [--verbose] [--timeout MS]

Options:
  --max-steps N    Max steps (default: 8)
  --mode           Agent | Plan | Ask (default: Agent). Plan = plan only; Ask = read-only.
  --goal-type      generic | runTestsAndFix | addEndpoint | improveTypes (omit to auto-detect)
  --verbose        Print structured trace (and planner stream when using --stream)
  --no-stream      Wait for full result instead of streaming steps (default: stream)
  --dry-run        Simulate writes/commands, no side effects
  --timeout MS     Task timeout in ms (default: 300000)

Env:
  AGENT_API_URL    Base URL (default: http://localhost:3000)
`,
    },
  );
}
