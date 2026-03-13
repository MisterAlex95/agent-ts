import React from "react";

type ThinkingBlockProps = {
  text: string;
};

function stripThinkTags(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (match) return match[1].trim();
  return trimmed.replace(/<think>\s*>/gi, "").replace(/<\/think\s*>/gi, "").trim();
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ text }) => {
  const display = stripThinkTags(text);
  if (!display) return null;

  return (
    <div className="feed-block feed-block-thinking" aria-label="Planner thought">
      <div className="feed-block-label">Thought briefly</div>
      <pre className="feed-block-content feed-block-thinking-content">{display}</pre>
    </div>
  );
};
