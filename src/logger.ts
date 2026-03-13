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

function formatMessage(level: LogLevel, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (!shouldLog("debug")) return;
    const base = formatMessage("debug", message);
    meta === undefined ? console.debug(base) : console.debug(base, meta);
  },
  info(message: string, meta?: unknown): void {
    if (!shouldLog("info")) return;
    const base = formatMessage("info", message);
    meta === undefined ? console.info(base) : console.info(base, meta);
  },
  warn(message: string, meta?: unknown): void {
    if (!shouldLog("warn")) return;
    const base = formatMessage("warn", message);
    meta === undefined ? console.warn(base) : console.warn(base, meta);
  },
  error(message: string, meta?: unknown): void {
    if (!shouldLog("error")) return;
    const base = formatMessage("error", message);
    meta === undefined ? console.error(base) : console.error(base, meta);
  },
};
