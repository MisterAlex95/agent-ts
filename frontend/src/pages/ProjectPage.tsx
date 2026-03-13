import React, { useCallback, useEffect, useState } from "react";
import { getIndexStatus } from "../api/client";

function formatLastIndexed(iso: string | null): string {
  if (!iso) return "Never indexed";
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return "Last indexed just now";
  if (sec < 3600) return `Last indexed ${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `Last indexed ${Math.floor(sec / 3600)} h ago`;
  return `Last indexed ${d.toLocaleDateString()}`;
}

export const ProjectPage: React.FC = () => {
  const [status, setStatus] = useState<string>("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<{ lastIndexedAt: string | null; indexedFiles: number; indexedChunks: number } | null>(null);

  const loadIndexStatus = useCallback(async () => {
    const s = await getIndexStatus();
    if (s) setIndexStatus(s);
  }, []);

  useEffect(() => {
    void loadIndexStatus();
  }, [loadIndexStatus]);

  const triggerIndex = async () => {
    setIsIndexing(true);
    setStatus("");
    try {
      const res = await fetch("/index", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(`Error: ${data.error ?? res.status}`);
        return;
      }
      setStatus("");
      void loadIndexStatus();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Project</h2>
          <p className="card-subtitle">
            Index your local workspace into Qdrant so the agent can reason about your code.
          </p>
        </div>
      </header>
      <div className="index-row">
        <button
          type="button"
          className="primary-button"
          disabled={isIndexing}
          onClick={triggerIndex}
        >
          {isIndexing ? "Indexing…" : "Index workspace"}
        </button>
        <span className="index-status">
          {indexStatus ? formatLastIndexed(indexStatus.lastIndexedAt) : ""}
          {indexStatus?.lastIndexedAt && indexStatus.indexedFiles > 0 && (
            <> — {indexStatus.indexedFiles} files, {indexStatus.indexedChunks} chunks</>
          )}
        </span>
      </div>
      {status && <p className="index-status index-error">{status}</p>}
    </section>
  );
};


