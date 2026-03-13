import React, { useState } from "react";

export const ProjectPage: React.FC = () => {
  const [status, setStatus] = useState<string>("");
  const [isIndexing, setIsIndexing] = useState(false);

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
      setStatus(
        `Indexed ${data.indexedFiles ?? 0} files, ${data.indexedChunks ?? 0} chunks`,
      );
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
        <span className="index-status">{status}</span>
      </div>
    </section>
  );
};


