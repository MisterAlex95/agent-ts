/* eslint-disable no-console */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const fromEnv = (process.env.AGENT_LOG_LEVEL ?? "").toLowerCase();
  if (
    fromEnv === "debug" ||
    fromEnv === "info" ||
    fromEnv === "warn" ||
    fromEnv === "error"
  ) {
    return fromEnv;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const CURRENT_LEVEL = resolveLogLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[CURRENT_LEVEL];
}

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m", // bright black / gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const RESET_COLOR = "\x1b[0m";

function formatMessage(level: LogLevel, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (!shouldLog("debug")) return;
    const base = formatMessage("debug", message);
    const colored = `${COLORS.debug}${base}${RESET_COLOR}`;
    meta === undefined ? console.debug(colored) : console.debug(colored, meta);
  },
  info(message: string, meta?: unknown): void {
    if (!shouldLog("info")) return;
    const base = formatMessage("info", message);
    const colored = `${COLORS.info}${base}${RESET_COLOR}`;
    meta === undefined ? console.info(colored) : console.info(colored, meta);
  },
  warn(message: string, meta?: unknown): void {
    if (!shouldLog("warn")) return;
    const base = formatMessage("warn", message);
    const colored = `${COLORS.warn}${base}${RESET_COLOR}`;
    meta === undefined ? console.warn(colored) : console.warn(colored, meta);
  },
  error(message: string, meta?: unknown): void {
    if (!shouldLog("error")) return;
    const base = formatMessage("error", message);
    const colored = `${COLORS.error}${base}${RESET_COLOR}`;
    meta === undefined ? console.error(colored) : console.error(colored, meta);
  },
};
