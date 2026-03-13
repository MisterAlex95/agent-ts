import React from "react";

type ExplorationBlockProps = {
  tool: string;
  params?: unknown;
  result?: string;
};

function getExplorationCount(tool: string, params: unknown, result: string | undefined): number {
  if (tool === "readFile") return 1;
  const p = params as Record<string, unknown> | undefined;
  if (tool === "readFiles" && Array.isArray(p?.paths)) return (p.paths as string[]).length;
  if (!result) return 0;
  try {
    const data = JSON.parse(result) as Record<string, unknown>;
    if (tool === "listFiles" && Array.isArray(data.list)) return data.list.length;
    if ((tool === "searchCode" || tool === "searchSymbols") && Array.isArray(data.results)) {
      return data.results.length;
    }
  } catch {
    // ignore
  }
  return 0;
}

export const ExplorationBlock: React.FC<ExplorationBlockProps> = ({
  tool,
  params,
  result,
}) => {
  const count = getExplorationCount(tool, params, result);
  const label =
    count === 0
      ? `Explored (${tool})`
      : count === 1
        ? "Explored 1 file"
        : `Explored ${count} files`;

  return (
    <div className="feed-block feed-block-exploration" aria-label="Exploration">
      <div className="feed-block-label">{label}</div>
    </div>
  );
};
