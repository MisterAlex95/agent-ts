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

function formatMeta(meta: unknown): string {
  if (meta == null) return "";
  if (typeof meta !== "object") return String(meta);
  const obj = meta as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (!entries.length) return "";
  const parts = entries.map(([key, value]) => {
    if (value === null || value === undefined) return `${key}=null`;
    if (typeof value === "string") {
      const v = value.length > 80 ? `${value.slice(0, 77)}…` : value;
      return `${key}="${v.replace(/\n/g, "\\n")}"`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return `${key}=${String(value)}`;
    }
    const json = JSON.stringify(value);
    const v = json.length > 120 ? `${json.slice(0, 117)}…` : json;
    return `${key}=${v}`;
  });
  return parts.join(" ");
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (!shouldLog("debug")) return;
    const base = formatMessage("debug", message);
    const metaStr = meta !== undefined ? ` ${formatMeta(meta)}` : "";
    const colored = `${COLORS.debug}${base}${metaStr}${RESET_COLOR}`;
    console.debug(colored);
  },
  info(message: string, meta?: unknown): void {
    if (!shouldLog("info")) return;
    const base = formatMessage("info", message);
    const metaStr = meta !== undefined ? ` ${formatMeta(meta)}` : "";
    const colored = `${COLORS.info}${base}${metaStr}${RESET_COLOR}`;
    console.info(colored);
  },
  warn(message: string, meta?: unknown): void {
    if (!shouldLog("warn")) return;
    const base = formatMessage("warn", message);
    const metaStr = meta !== undefined ? ` ${formatMeta(meta)}` : "";
    const colored = `${COLORS.warn}${base}${metaStr}${RESET_COLOR}`;
    console.warn(colored);
  },
  error(message: string, meta?: unknown): void {
    if (!shouldLog("error")) return;
    const base = formatMessage("error", message);
    const metaStr = meta !== undefined ? ` ${formatMeta(meta)}` : "";
    const colored = `${COLORS.error}${base}${metaStr}${RESET_COLOR}`;
    console.error(colored);
  },
};
