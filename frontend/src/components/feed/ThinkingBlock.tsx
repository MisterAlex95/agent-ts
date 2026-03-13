import React from "react";

type ThinkingBlockProps = {
  text: string;
  /** When false, hide the trailing tool JSON (e.g. {"tool":"readFile","params":{...}}) */
  verbose?: boolean;
};

function stripThinkTags(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (match) return match[1].trim();
  return trimmed.replace(/<think>\s*>/gi, "").replace(/<\/think\s*>/gi, "").trim();
}

/** Remove trailing {"tool":"...","params":...} from planner output when not verbose */
function stripToolJson(text: string): string {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\s*\{\s*"tool"\s*:\s*"[^"]*"\s*,\s*"params"\s*:\s*[\s\S]*\}\s*$/);
  if (jsonMatch) return trimmed.slice(0, trimmed.length - jsonMatch[0].length).trim();
  return trimmed;
}

/** Extract trailing tool JSON for verbose display */
function extractToolJson(text: string): string | null {
  const match = text.trim().match(/\{\s*"tool"\s*:\s*"[^"]*"\s*,\s*"params"\s*:\s*[\s\S]*\}\s*$/);
  return match ? match[0] : null;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ text, verbose = false }) => {
  const raw = verbose ? text : stripToolJson(text);
  const thinkPart = stripThinkTags(raw);
  const jsonPart = verbose ? extractToolJson(text) : null;
  const display = jsonPart ? (thinkPart ? `${thinkPart}\n\n${jsonPart}` : jsonPart) : thinkPart;
  if (!display) return null;

  return (
    <div className="feed-block feed-block-thinking" aria-label="Planner thought">
      <div className="feed-block-label">Thought briefly</div>
      <pre className="feed-block-content feed-block-thinking-content">{display}</pre>
    </div>
  );
};
