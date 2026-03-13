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
    if (tool === "listFiles" && Array.isArray(data.files)) return data.files.length;
    if (tool === "listFiles" && Array.isArray(data.entries)) return data.entries.length;
    if ((tool === "searchCode" || tool === "searchSymbols") && Array.isArray(data.results)) {
      return data.results.length;
    }
  } catch {
    // ignore
  }
  return 0;
}

function getExplorationFileNames(
  tool: string,
  params: unknown,
  result: string | undefined,
): string[] {
  const p = params as Record<string, unknown> | undefined;
  if (tool === "readFile" && p?.path && typeof p.path === "string") return [p.path];
  if (tool === "readFiles" && Array.isArray(p?.paths)) return (p.paths as string[]).slice(0, 20);
  if (!result) return [];
  try {
    const data = JSON.parse(result) as Record<string, unknown>;
    if (tool === "listFiles") {
      if (Array.isArray(data.files)) return (data.files as string[]).slice(0, 20);
      if (Array.isArray(data.entries)) {
        return (data.entries as Array<{ name?: string; path?: string }>)
          .map((e) => e.path ?? e.name ?? "")
          .filter(Boolean)
          .slice(0, 20);
      }
    }
    if ((tool === "searchCode" || tool === "searchSymbols") && Array.isArray(data.results)) {
      return (data.results as Array<{ filePath?: string }>)
        .map((r) => r.filePath ?? "")
        .filter(Boolean)
        .filter((path, i, arr) => arr.indexOf(path) === i)
        .slice(0, 20);
    }
  } catch {
    // ignore
  }
  return [];
}

const MAX_NAMES_IN_LABEL = 3;

export const ExplorationBlock: React.FC<ExplorationBlockProps> = ({
  tool,
  params,
  result,
}) => {
  const count = getExplorationCount(tool, params, result);
  const fileNames = getExplorationFileNames(tool, params, result);

  let label: string;
  if (count === 0) {
    label = `Explored (${tool})`;
  } else if (fileNames.length === 0) {
    label = count === 1 ? "Explored 1 file" : `Explored ${count} files`;
  } else if (fileNames.length === 1) {
    label = `Explored ${fileNames[0]}`;
  } else {
    const shown = fileNames.slice(0, MAX_NAMES_IN_LABEL).join(", ");
    const rest = fileNames.length - MAX_NAMES_IN_LABEL;
    label = rest > 0 ? `Explored ${shown} and ${rest} more` : `Explored ${shown}`;
  }

  return (
    <div className="feed-block feed-block-exploration" aria-label="Exploration">
      <div className="feed-block-label">{label}</div>
    </div>
  );
};
