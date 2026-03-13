import React, { useEffect, useRef, useState } from "react";
import { codeToHtml } from "shiki";
import type { FileChangeDisplay } from "../../types";

function pathToShikiLang(filePath: string): string {
  const ext = filePath.replace(/^.*\./, "").toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    vue: "vue",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    md: "markdown",
    mdx: "mdx",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    bash: "shell",
  };
  return map[ext] ?? "text";
}

type FileChangeBlockProps = {
  tool: string;
  params?: unknown;
  /** When provided (from backend), use instead of deriving from params */
  display?: FileChangeDisplay | null;
};

interface DiffSummary {
  path: string;
  added: number;
  removed: number;
  snippet: string;
}

function getFileChangeSummary(tool: string, params: unknown): DiffSummary | null {
  const p = params as Record<string, unknown> | undefined;
  if (!p) return null;

  const path = typeof p.path === "string" ? p.path : "";

  switch (tool) {
    case "writeFile": {
      const content = typeof p.content === "string" ? p.content : "";
      const lines = content.split("\n").length;
      return { path, added: lines, removed: 0, snippet: content.slice(0, 2000) };
    }
    case "searchReplace": {
      const oldText = typeof p.oldText === "string" ? p.oldText : "";
      const newText = typeof p.newText === "string" ? p.newText : "";
      const added = newText.split("\n").length;
      const removed = oldText.split("\n").length;
      return { path, added, removed, snippet: newText.slice(0, 2000) };
    }
    case "appendFile": {
      const content = typeof p.content === "string" ? p.content : "";
      const added = content.split("\n").length;
      return { path, added, removed: 0, snippet: content.slice(0, 2000) };
    }
    case "editLines": {
      const edits = Array.isArray(p.edits) ? p.edits : [];
      return {
        path,
        added: edits.length,
        removed: edits.length,
        snippet: edits
          .map((e: unknown) => {
            const x = e as Record<string, unknown>;
            return `line ${x.line}: ${String(x.content ?? "").slice(0, 80)}`;
          })
          .join("\n")
          .slice(0, 2000),
      };
    }
    default:
      return path ? { path, added: 0, removed: 0, snippet: "" } : null;
  }
}

export const FileChangeBlock: React.FC<FileChangeBlockProps> = ({
  tool,
  params,
  display: displayFromBackend,
}) => {
  const summary =
    displayFromBackend?.kind === "file_change"
      ? {
          path: displayFromBackend.filePath,
          added: displayFromBackend.diffSummary.added,
          removed: displayFromBackend.diffSummary.removed,
          snippet: displayFromBackend.snippet,
        }
      : getFileChangeSummary(tool, params);
  if (!summary) return null;

  const path = summary.path;
  const added = summary.added;
  const removed = summary.removed;
  const snippet = summary.snippet;
  const hasDiff = added > 0 || removed > 0;

  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!snippet || !path) {
      setHighlightedHtml(null);
      return;
    }
    const lang = pathToShikiLang(path);
    if (lang === "text") {
      setHighlightedHtml(null);
      return;
    }
    const run = ++runRef.current;
    codeToHtml(snippet, { lang, theme: "github-dark" })
      .then((html) => {
        if (run === runRef.current) setHighlightedHtml(html);
      })
      .catch(() => {
        if (run === runRef.current) setHighlightedHtml(null);
      });
  }, [snippet, path]);

  return (
    <div className="feed-block feed-block-file-change" aria-label="File change">
      <div className="feed-block-file-header feed-block-file-header-diff">
        <span className="feed-block-file-path">{path}</span>
        {hasDiff && (
          <span className="feed-block-file-diff-stats">
            {added > 0 && <span className="feed-block-diff-added">+{added}</span>}
            {added > 0 && removed > 0 && " "}
            {removed > 0 && <span className="feed-block-diff-removed">-{removed}</span>}
          </span>
        )}
      </div>
      {snippet &&
        (highlightedHtml ? (
          <div
            className="feed-block-content feed-block-code feed-block-code-added feed-block-code-shiki"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="feed-block-content feed-block-code feed-block-code-added">
            {snippet}
          </pre>
        ))}
    </div>
  );
};
