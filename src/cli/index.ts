#!/usr/bin/env node
/**
 * CLI entry: parse args and dispatch to commands.
 *   agent index
 *   agent run "Your task description" [options]
 */

import { parseArgs } from "./args.js";
import { runIndex } from "./commands/index.js";
import { runTask, runTaskStream } from "./commands/run.js";
import { printUsage } from "./usage.js";
import { logger } from "../logger.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, task, maxSteps, goalType, mode, verbose, timeoutMs, stream, dryRun } = parseArgs(args);

  if (!command || command === "help" || command === "-h" || command === "--help") {
    printUsage();
    process.exit(0);
  }

  if (command === "index") {
    await runIndex();
    return;
  }

  if (command === "run") {
    if (!task) {
      logger.error("Missing task for run command", {
        hint: 'Usage: agent run "Your task here"',
      });
      process.exit(1);
    }
    const runOpts = { maxSteps, goalType, mode, verbose, timeoutMs, dryRun };
    if (stream) {
      await runTaskStream(task, runOpts);
    } else {
      await runTask(task, runOpts);
    }
    return;
  }

  logger.error("Unknown command", { command });
  printUsage();
  process.exit(1);
}

main().catch((err) => {
  logger.error("CLI main failed", { error: err });
  process.exit(1);
});
