import React, { useCallback, useEffect, useState } from "react";
import {
  getKanbanBoards,
  getKanbanBoard,
  createKanbanBoard,
  updateKanbanBoard,
  createKanbanCard,
  updateKanbanCard,
  deleteKanbanCard,
  triggerSchedulerRunOnce,
  getKanbanSchedulerStatus,
  generateKanbanCardsWithAi,
  type KanbanBoard,
  type KanbanBoardSummary,
  type KanbanCard,
  type KanbanColumnWithCards,
  type KanbanSchedulerStatus,
} from "../api/client";

const POLL_INTERVAL_MS = 15000;
const SCHEDULER_STATUS_POLL_MS = 3000;

type KanbanPageProps = {
  onOpenRun?: (runId: string) => void;
};

export const KanbanPage: React.FC<KanbanPageProps> = ({ onOpenRun }) => {
  const [boards, setBoards] = useState<KanbanBoardSummary[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [runOnceLoading, setRunOnceLoading] = useState(false);
  const [showNewBoardForm, setShowNewBoardForm] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [editingProjectPath, setEditingProjectPath] = useState(false);
  const [projectPathDraft, setProjectPathDraft] = useState("");
  const [savingProjectPath, setSavingProjectPath] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<KanbanSchedulerStatus | null>(null);

  const fetchBoards = useCallback(async () => {
    const list = await getKanbanBoards();
    setBoards(list);
    setSelectedBoardId((prev) => {
      if (list.length === 0) return null;
      if (prev === null) return list[0].id;
      if (list.some((b) => b.id === prev)) return prev;
      return list[0].id;
    });
  }, []);

  const fetchBoard = useCallback(async () => {
    if (selectedBoardId == null) {
      setBoard(null);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const b = await getKanbanBoard(selectedBoardId);
      setBoard(b ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedBoardId]);

  useEffect(() => {
    void fetchBoards();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBoard();
  }, [fetchBoard]);

  useEffect(() => {
    if (selectedBoardId == null) return;
    const id = window.setInterval(() => {
      void getKanbanBoard(selectedBoardId).then((b) => setBoard(b ?? null));
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [selectedBoardId]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getKanbanSchedulerStatus().then((s) => {
        if (!cancelled) setSchedulerStatus(s);
      });
    };
    poll();
    const id = window.setInterval(poll, SCHEDULER_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const handleAddCard = useCallback(async () => {
    const title = addTitle.trim();
    if (!title || adding || !board) return;
    setAdding(true);
    try {
      await createKanbanCard({
        title,
        description: addDescription.trim() || undefined,
        column_slug: "todo",
        board_id: board.id,
      });
      setAddTitle("");
      setAddDescription("");
      await fetchBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }, [addTitle, addDescription, adding, board, fetchBoard]);

  const handleCreateBoard = useCallback(async () => {
    const name = newBoardName.trim();
    if (!name || creatingBoard) return;
    setCreatingBoard(true);
    try {
      const newBoard = await createKanbanBoard(name);
      setNewBoardName("");
      setShowNewBoardForm(false);
      const list = await getKanbanBoards();
      setBoards(list);
      setSelectedBoardId(newBoard.id);
      setBoard(newBoard);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingBoard(false);
    }
  }, [newBoardName, creatingBoard]);

  const handleSaveProjectPath = useCallback(async () => {
    if (!board || savingProjectPath) return;
    setSavingProjectPath(true);
    try {
      const updated = await updateKanbanBoard(board.id, {
        project_path: projectPathDraft.trim() || null,
      });
      setBoard(updated);
      setEditingProjectPath(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingProjectPath(false);
    }
  }, [board, projectPathDraft, savingProjectPath]);

  const handleGenerateAiCards = useCallback(async () => {
    if (!board || aiLoading) return;
    setAiLoading(true);
    setError(null);
    try {
      const result = await generateKanbanCardsWithAi(
        board.id,
        aiPrompt || "Suggest 3 to 5 useful development tasks.",
      );
      setAiPrompt("");
      await fetchBoard();
      if (result.created.length > 0) {
        setError(null);
      }
      if (result.error && result.created.length === 0) {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  }, [board, aiPrompt, aiLoading, fetchBoard]);

  const handleMoveCard = useCallback(
    async (card: KanbanCard, columnId: number) => {
      if (card.column_id === columnId) return;
      try {
        await updateKanbanCard(card.id, { column_id: columnId });
        await fetchBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [fetchBoard],
  );

  const handleDeleteCard = useCallback(
    async (cardId: string) => {
      try {
        await deleteKanbanCard(cardId);
        await fetchBoard();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [fetchBoard],
  );

  const handleRunOnce = useCallback(async () => {
    if (runOnceLoading) return;
    setRunOnceLoading(true);
    try {
      await triggerSchedulerRunOnce();
      await fetchBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunOnceLoading(false);
    }
  }, [runOnceLoading, fetchBoard]);

  if (loading && boards.length === 0) {
    return (
      <div className="card">
        <p className="card-subtitle">Loading…</p>
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="kanban-page">
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Kanban</h2>
          <p className="card-subtitle">Create your first board to get started.</p>
          {showNewBoardForm ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
              <input
                type="text"
                className="input"
                placeholder="Board name"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className="btn btn-primary" onClick={handleCreateBoard} disabled={!newBoardName.trim() || creatingBoard}>
                  {creatingBoard ? "Creating…" : "Create board"}
                </button>
                <button type="button" className="btn" onClick={() => { setShowNewBoardForm(false); setNewBoardName(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" style={{ marginTop: "0.75rem" }} onClick={() => setShowNewBoardForm(true)}>
              New board
            </button>
          )}
        </div>
        {error && <p className="card-subtitle" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    );
  }

  if (error && !board) {
    return (
      <div className="card">
        <p className="card-subtitle" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!board && selectedBoardId != null && !loading) {
    return (
      <div className="card">
        <p className="card-subtitle">Board not found.</p>
      </div>
    );
  }

  if (loading && board === null) {
    return (
      <div className="card">
        <p className="card-subtitle">Loading board…</p>
      </div>
    );
  }

  if (!board) return null;

  return (
    <div className="kanban-page">
      <header className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h2 className="card-title">Kanban</h2>
            <select
              className="select"
              value={selectedBoardId ?? ""}
              onChange={(e) => setSelectedBoardId(Number(e.target.value))}
              style={{ minWidth: "140px" }}
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {showNewBoardForm ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="input"
                  placeholder="New board name"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()}
                  style={{ width: "160px" }}
                />
                <button type="button" className="btn btn-primary" onClick={handleCreateBoard} disabled={!newBoardName.trim() || creatingBoard}>
                  {creatingBoard ? "…" : "Create"}
                </button>
                <button type="button" className="btn" onClick={() => { setShowNewBoardForm(false); setNewBoardName(""); }}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => setShowNewBoardForm(true)}>+ New board</button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunOnce}
            disabled={runOnceLoading}
          >
            {runOnceLoading ? "Running…" : "Run scheduler once"}
          </button>
        </div>
        <p className="card-subtitle">
          Tasks are picked from To Do every 30 minutes (when scheduler is enabled). Use “Run scheduler once” to trigger the agent on the next task now.
        </p>
        <div style={{ marginTop: "0.75rem" }}>
          {editingProjectPath ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span className="card-subtitle" style={{ marginRight: "0.25rem" }}>Project path (IA works only in workspace/…/):</span>
              <input
                type="text"
                className="input"
                placeholder="e.g. projetA"
                value={projectPathDraft}
                onChange={(e) => setProjectPathDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveProjectPath()}
                style={{ width: "180px" }}
              />
              <button type="button" className="btn btn-primary" onClick={handleSaveProjectPath} disabled={savingProjectPath}>
                {savingProjectPath ? "…" : "Save"}
              </button>
              <button type="button" className="btn" onClick={() => { setEditingProjectPath(false); setProjectPathDraft(board?.project_path ?? ""); }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span className="card-subtitle">
                Project: {board.project_path ? (
                  <strong>{board.project_path}</strong>
                ) : (
                  <span style={{ color: "var(--text-soft)" }}>not set (IA can touch whole workspace)</span>
                )}
                {board.project_path && (
                  <span style={{ color: "var(--text-soft)", marginLeft: "0.25rem" }}>
                    (IA works only in workspace/{board.project_path}/)
                  </span>
                )}
              </span>
              <button type="button" className="btn" style={{ fontSize: "0.8rem" }} onClick={() => { setProjectPathDraft(board?.project_path ?? ""); setEditingProjectPath(true); }}>Edit</button>
            </div>
          )}
        </div>
        {error && <p className="card-subtitle" style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{error}</p>}
      </header>

      <div className="kanban-add card" style={{ marginBottom: "1rem" }}>
        <h3 className="card-title" style={{ fontSize: "1rem" }}>Add card (To Do)</h3>
        <div className="field-group" style={{ marginBottom: "0.5rem" }}>
          <input
            type="text"
            className="input"
            placeholder="Title"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCard()}
          />
        </div>
        <div className="field-group" style={{ marginBottom: "0.5rem" }}>
          <textarea
            className="textarea"
            placeholder="Description (optional)"
            rows={2}
            value={addDescription}
            onChange={(e) => setAddDescription(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAddCard}
          disabled={!addTitle.trim() || adding}
        >
          {adding ? "Adding…" : "Add card"}
        </button>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card-title" style={{ fontSize: "1rem" }}>Generate cards with AI</h3>
        <p className="card-subtitle" style={{ marginBottom: "0.5rem" }}>
          Describe what cards you want; the AI will suggest titles and create them in To Do.
        </p>
        <div className="field-group" style={{ marginBottom: "0.5rem" }}>
          <textarea
            className="textarea"
            placeholder='e.g. "3 cards: add unit tests for auth, fix login redirect, document the API"'
            rows={2}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleGenerateAiCards}
          disabled={aiLoading}
        >
          {aiLoading ? "Generating…" : "Generate cards"}
        </button>
      </div>

      <div className="kanban-board" style={{ display: "flex", gap: "1rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
        {board.columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            allColumns={board.columns}
            onMoveCard={handleMoveCard}
            onDeleteCard={handleDeleteCard}
            onOpenRun={onOpenRun}
            schedulerStatus={schedulerStatus}
          />
        ))}
      </div>
    </div>
  );
};

type KanbanColumnProps = {
  column: KanbanColumnWithCards;
  allColumns: KanbanColumnWithCards[];
  onMoveCard: (card: KanbanCard, columnId: number) => void;
  onDeleteCard: (cardId: string) => void;
  onOpenRun?: (runId: string) => void;
  schedulerStatus: KanbanSchedulerStatus | null;
};

const KanbanColumn: React.FC<KanbanColumnProps> = ({ column, allColumns, onMoveCard, onDeleteCard, onOpenRun, schedulerStatus }) => {
  return (
    <div
      className="card kanban-column"
      style={{
        minWidth: "280px",
        maxWidth: "280px",
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100vh - 220px)",
      }}
    >
      <header className="card-header" style={{ paddingBottom: "0.5rem" }}>
        <h3 className="card-title" style={{ fontSize: "0.95rem" }}>
          {column.label}
        </h3>
        <span className="card-subtitle" style={{ fontSize: "0.75rem" }}>{column.cards.length}</span>
      </header>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {column.cards.map((card) => (
          <KanbanCardItem
            key={card.id}
            card={card}
            currentColumnId={column.id}
            allColumns={allColumns}
            onMove={onMoveCard}
            onDelete={onDeleteCard}
            onOpenRun={onOpenRun}
            isWorkingOn={schedulerStatus?.busy === true && schedulerStatus?.cardId === card.id}
          />
        ))}
      </div>
    </div>
  );
};

type KanbanCardItemProps = {
  card: KanbanCard;
  currentColumnId: number;
  allColumns: KanbanColumnWithCards[];
  onMove: (card: KanbanCard, columnId: number) => void;
  onDelete: (cardId: string) => void;
  onOpenRun?: (runId: string) => void;
  isWorkingOn?: boolean;
};

const KanbanCardItem: React.FC<KanbanCardItemProps> = ({ card, currentColumnId, allColumns, onMove, onDelete, onOpenRun, isWorkingOn }) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`kanban-card${isWorkingOn ? " kanban-card-working" : ""}`}
      style={{
        padding: "0.6rem 0.75rem",
        background: "var(--bg-elevated-soft)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-subtle)",
        position: "relative",
      }}
    >
      {isWorkingOn && (
        <div className="kanban-card-indicator" aria-label="Agent working on this card">
          <span className="kanban-card-indicator-dot" />
          <span>Agent working…</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.25rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{card.title}</div>
          {card.description && (
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--text-soft)",
                marginTop: "0.25rem",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {card.description}
            </div>
          )}
          {card.run_id && (
            onOpenRun ? (
              <button
                type="button"
                onClick={() => onOpenRun(card.run_id!)}
                style={{ fontSize: "0.75rem", color: "var(--accent)", marginTop: "0.25rem", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
              >
                View run
              </button>
            ) : (
              <span style={{ fontSize: "0.75rem", color: "var(--text-soft)", marginTop: "0.25rem" }}>Run: {card.run_id.slice(0, 8)}…</span>
            )
          )}
        </div>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="nav-item"
            style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Card menu"
          >
            ⋮
          </button>
          {showMenu && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 10 }}
                onClick={() => setShowMenu(false)}
                aria-hidden
              />
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: "0.25rem",
                  zIndex: 11,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.25rem",
                  minWidth: "140px",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "var(--text-soft)", padding: "0.25rem 0.5rem" }}>Move to</div>
                {allColumns
                  .filter((c) => c.id !== currentColumnId)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="nav-item"
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}
                      onClick={() => {
                        onMove(card, c.id);
                        setShowMenu(false);
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                <button
                  type="button"
                  className="nav-item"
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "0.35rem 0.5rem", fontSize: "0.8rem", color: "var(--danger)" }}
                  onClick={() => {
                    onDelete(card.id);
                    setShowMenu(false);
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
