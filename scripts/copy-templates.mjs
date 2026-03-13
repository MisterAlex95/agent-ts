#!/usr/bin/env node
/**
 * ESM-safe copy of prompt templates from src to dist.
 * Run after tsc so dist/prompts exists.
 */
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "src", "prompts", "templates");
const dest = join(root, "dist", "prompts", "templates");

if (!existsSync(src)) {
  console.warn("copy-templates: src dir not found, skipping");
  process.exit(0);
}
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
