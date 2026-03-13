import { getForbiddenDirNames } from "../../config/workspace.js";

export const PROTECTED_PATH_PATTERNS: RegExp[] = [
  /^\.git(?:\/|$)/,
  /^node_modules(?:\/|$)/,
  /^dist(?:\/|$)/,
  /^build(?:\/|$)/,
  /^.*\.log$/i,
];

export const READ_FILE_BEGIN_MARKER = "(beginning of file)\n";
export const READ_FILE_END_MARKER = "\n(end of file)";
export const DEFAULT_GREP_MAX_MATCHES = 80;

export const DEFAULT_MAX_TOOL_TEXT_CHARS = 20_000;

export function isProtectedPath(pathRelative: string): boolean {
  const normalized = pathRelative.replace(/\\/g, "/");
  if (PROTECTED_PATH_PATTERNS.some((re) => re.test(normalized))) return true;
  const parts = normalized.split("/").map((p) => p.toLowerCase());
  const forbidden = getForbiddenDirNames();
  return parts.some((p) => forbidden.has(p));
}

export function isGitPath(pathRelative: string): boolean {
  const parts = pathRelative.replace(/\\/g, "/").split("/").map((p) => p.toLowerCase());
  return parts.some((p) => p === ".git");
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/\*\*/g, "\x01")
    .replace(/\*/g, "\x02")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\x02/g, "[^/]*")
    .replace(/\x01/g, ".*");
  return new RegExp(escaped + "$", "i");
}

export function truncateText(
  text: string,
  options?: { maxChars?: number; headChars?: number; tailChars?: number },
): { text: string; truncated: boolean; originalChars: number } {
  const originalChars = text.length;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_TOOL_TEXT_CHARS;
  if (originalChars <= maxChars) {
    return { text, truncated: false, originalChars };
  }

  const head = Math.max(0, options?.headChars ?? Math.floor(maxChars * 0.6));
  const tail = Math.max(0, options?.tailChars ?? maxChars - head);
  const headPart = text.slice(0, head);
  const tailPart = tail > 0 ? text.slice(-tail) : "";
  const omitted = originalChars - headPart.length - tailPart.length;
  const marker = `\n... (truncated, omitted ${omitted} chars) ...\n`;
  return {
    text: headPart + marker + tailPart,
    truncated: true,
    originalChars,
  };
}
