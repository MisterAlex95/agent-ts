import React, { useCallback, useEffect, useRef, useState } from "react";
import { codeToHtml } from "shiki";
import { listProjectFiles, readProjectFile, type WorkspaceEntry } from "../api/client";

type TreeState = Record<string, WorkspaceEntry[]>;

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

export const FilesPage: React.FC = () => {
  const [tree, setTree] = useState<TreeState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const highlightRunRef = useRef(0);

  const loadDir = useCallback(async (path: string) => {
    setLoadingPath(path);
    try {
      const { entries } = await listProjectFiles(path);
      setTree((prev) => ({ ...prev, [path]: entries }));
    } finally {
      setLoadingPath(null);
    }
  }, []);

  useEffect(() => {
    void loadDir(".");
  }, [loadDir]);

  const toggleDir = (path: string) => {
    void loadDir(path);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectFile = useCallback(async (path: string) => {
    setSelectedPath(path);
    setContent(null);
    setHighlightedHtml(null);
    setContentError(null);
    try {
      const text = await readProjectFile(path);
      setContent(text);
    } catch (err) {
      setContentError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (content === null || selectedPath === null) {
      setHighlightedHtml(null);
      return;
    }
    const lang = pathToShikiLang(selectedPath);
    const run = ++highlightRunRef.current;
    if (lang === "text") {
      setHighlightedHtml(null);
      return;
    }
    codeToHtml(content, { lang, theme: "github-dark" })
      .then((html) => {
        if (run === highlightRunRef.current) setHighlightedHtml(html);
      })
      .catch(() => {
        if (run === highlightRunRef.current) setHighlightedHtml(null);
      });
  }, [content, selectedPath]);

  const rootEntries = tree["."] ?? [];
  const loadingRoot = loadingPath === ".";

  return (
    <div className="files-explorer">
      <section className="card files-explorer-card">
        <header className="card-header">
          <div>
            <h2 className="card-title">Files</h2>
            <p className="card-subtitle">
              Browse project files. Click a folder to expand, a file to view.
            </p>
          </div>
        </header>
        <div className="files-explorer-body">
          <div className="files-tree-panel" aria-label="File tree">
            <div className="files-tree-toolbar">Workspace</div>
            {loadingRoot ? (
              <div className="files-tree-loading">Loading…</div>
            ) : (
              <ul className="files-tree" role="tree">
                {rootEntries.map((entry) => (
                  <TreeNode
                    key={entry.path}
                    entry={entry}
                    tree={tree}
                    expanded={expanded}
                    loadingPath={loadingPath}
                    selectedPath={selectedPath}
                    onToggleDir={toggleDir}
                    onLoadDir={loadDir}
                    onSelect={selectFile}
                    depth={0}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="files-viewer-panel" aria-label="File content">
            {selectedPath ? (
              <>
                <div className="files-viewer-toolbar">{selectedPath}</div>
                {contentError ? (
                  <div className="files-viewer-error">{contentError}</div>
                ) : content !== null ? highlightedHtml ? (
                  <div
                    className="files-viewer-content files-viewer-content-code"
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                  />
                ) : (
                  <pre className="files-viewer-content files-viewer-content-plain">{content}</pre>
                ) : (
                  <div className="files-viewer-loading">Loading…</div>
                )}
              </>
            ) : (
              <div className="files-viewer-empty">Select a file to view its content.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

type TreeNodeProps = {
  entry: WorkspaceEntry;
  tree: TreeState;
  expanded: Set<string>;
  loadingPath: string | null;
  selectedPath: string | null;
  onToggleDir: (path: string) => void;
  onLoadDir: (path: string) => void;
  onSelect: (path: string) => void;
  depth: number;
};

const TreeNode: React.FC<TreeNodeProps> = ({
  entry,
  tree,
  expanded,
  loadingPath,
  selectedPath,
  onToggleDir,
  onLoadDir,
  onSelect,
  depth,
}) => {
  const isDir = entry.type === "directory";
  const isExpanded = isDir && expanded.has(entry.path);
  const children = isDir ? tree[entry.path] : undefined;
  const isLoading = loadingPath === entry.path;

  useEffect(() => {
    if (isDir && isExpanded && !children) {
      void onLoadDir(entry.path);
    }
  }, [isDir, isExpanded, children, entry.path, onLoadDir]);

  const handleClick = () => {
    if (isDir) {
      onToggleDir(entry.path);
    } else {
      onSelect(entry.path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const isSelected = selectedPath === entry.path;

  return (
    <li
      role="treeitem"
      aria-expanded={isDir ? isExpanded : undefined}
      aria-selected={!isDir && isSelected}
      className={`files-tree-item ${isDir ? "files-tree-dir" : "files-tree-file"} ${isSelected ? "files-tree-item-selected" : ""}`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <div
        className="files-tree-row"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
      >
        <span className="files-tree-icon" aria-hidden>
          {isDir ? (isExpanded ? "▼" : "▶") : " "}
        </span>
        <span className="files-tree-name">{entry.name}</span>
        {isLoading && <span className="files-tree-busy">…</span>}
      </div>
      {isDir && isExpanded && children !== undefined && (
        <ul className="files-tree" role="group">
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              tree={tree}
              expanded={expanded}
              loadingPath={loadingPath}
              selectedPath={selectedPath}
              onToggleDir={onToggleDir}
              onLoadDir={onLoadDir}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};
