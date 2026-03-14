import crypto from "node:crypto";
import { getDb } from "./db.js";

export interface KanbanColumnRow {
  id: number;
  board_id: number;
  slug: string;
  label: string;
  position: number;
}

export interface KanbanCardRow {
  id: string;
  column_id: number;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  run_id: string | null;
}

export interface KanbanColumnWithCards extends KanbanColumnRow {
  cards: KanbanCardRow[];
}

export interface KanbanBoardResponse {
  id: number;
  name: string;
  created_at: string;
  project_path: string | null;
  columns: KanbanColumnWithCards[];
}

export interface KanbanBoardSummary {
  id: number;
  name: string;
  created_at: string;
  project_path: string | null;
}

const DEFAULT_COLUMNS: [string, string, number][] = [
  ["todo", "To Do", 0],
  ["in_progress", "In Progress", 1],
  ["to_test", "To Test", 2],
  ["to_review", "To Review", 3],
  ["done", "Done", 4],
];

export function listBoards(): KanbanBoardSummary[] {
  const db = getDb();
  return db
    .prepare("SELECT id, name, created_at, project_path FROM boards ORDER BY id")
    .all() as KanbanBoardSummary[];
}

export function createBoard(name: string, projectPath?: string | null): KanbanBoardResponse {
  const db = getDb();
  const now = new Date().toISOString();
  const trimmed = name.trim() || "New board";
  const pp = projectPath != null && typeof projectPath === "string" ? projectPath.trim() || null : null;
  const result = db.prepare("INSERT INTO boards (name, created_at, project_path) VALUES (?, ?, ?)").run(trimmed, now, pp);
  const boardId = result.lastInsertRowid as number;
  const insertCol = db.prepare(
    "INSERT INTO kanban_columns (board_id, slug, label, position) VALUES (?, ?, ?, ?)",
  );
  for (const [slug, label, position] of DEFAULT_COLUMNS) {
    insertCol.run(boardId, slug, label, position);
  }
  return getBoard(boardId)!;
}

export function updateBoard(
  boardId: number,
  patch: { name?: string; project_path?: string | null },
): KanbanBoardResponse | null {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM boards WHERE id = ?").get(boardId);
  if (!existing) return null;
  const updates: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    updates.push("name = ?");
    values.push(patch.name.trim());
  }
  if (patch.project_path !== undefined) {
    updates.push("project_path = ?");
    values.push(patch.project_path && typeof patch.project_path === "string" ? patch.project_path.trim() || null : null);
  }
  if (updates.length === 0) return getBoard(boardId);
  values.push(boardId);
  db.prepare(`UPDATE boards SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getBoard(boardId);
}

export function getBoard(boardId = 1): KanbanBoardResponse | null {
  const db = getDb();
  const board = db.prepare("SELECT id, name, created_at, project_path FROM boards WHERE id = ?").get(boardId) as
    | { id: number; name: string; created_at: string; project_path: string | null }
    | undefined;
  if (!board) return null;

  const columns = db
    .prepare(
      "SELECT id, board_id, slug, label, position FROM kanban_columns WHERE board_id = ? ORDER BY position",
    )
    .all(boardId) as KanbanColumnRow[];

  const columnsWithCards: KanbanColumnWithCards[] = columns.map((col) => {
    const cards = db
      .prepare(
        "SELECT id, column_id, title, description, position, created_at, updated_at, run_id FROM kanban_cards WHERE column_id = ? ORDER BY position, created_at",
      )
      .all(col.id) as KanbanCardRow[];
    return { ...col, cards };
  });

  return {
    id: board.id,
    name: board.name,
    created_at: board.created_at,
    project_path: board.project_path ?? null,
    columns: columnsWithCards,
  };
}

export function getColumnBySlug(boardId: number, slug: string): KanbanColumnRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, board_id, slug, label, position FROM kanban_columns WHERE board_id = ? AND slug = ?")
    .get(boardId, slug) as KanbanColumnRow | undefined;
  return row ?? null;
}

export function getColumnById(columnId: number): KanbanColumnRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, board_id, slug, label, position FROM kanban_columns WHERE id = ?")
    .get(columnId) as KanbanColumnRow | undefined;
  return row ?? null;
}

export function getCardById(cardId: string): KanbanCardRow | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, column_id, title, description, position, created_at, updated_at, run_id FROM kanban_cards WHERE id = ?",
    )
    .get(cardId) as KanbanCardRow | undefined;
  return row ?? null;
}

/** Get cards in a column by slug (e.g. "todo") for the default board. Used by scheduler. */
export function getCardsInColumnBySlug(boardId: number, slug: string): KanbanCardRow[] {
  const col = getColumnBySlug(boardId, slug);
  if (!col) return [];
  const db = getDb();
  return db
    .prepare(
      "SELECT id, column_id, title, description, position, created_at, updated_at, run_id FROM kanban_cards WHERE column_id = ? ORDER BY position, created_at",
    )
    .all(col.id) as KanbanCardRow[];
}

export function createCard(params: {
  columnId: number;
  title: string;
  description?: string | null;
}): KanbanCardRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const maxPos = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM kanban_cards WHERE column_id = ?")
    .get(params.columnId) as { next: number };
  const position = maxPos.next;

  db.prepare(
    "INSERT INTO kanban_cards (id, column_id, title, description, position, created_at, updated_at, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
  ).run(
    id,
    params.columnId,
    params.title,
    params.description ?? null,
    position,
    now,
    now,
  );

  return getCardById(id)!;
}

export function updateCard(
  cardId: string,
  patch: { title?: string; description?: string | null; column_id?: number; run_id?: string | null },
): KanbanCardRow | null {
  const db = getDb();
  const existing = getCardById(cardId);
  if (!existing) return null;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    updates.push("title = ?");
    values.push(patch.title);
  }
  if (patch.description !== undefined) {
    updates.push("description = ?");
    values.push(patch.description);
  }
  if (patch.column_id !== undefined) {
    updates.push("column_id = ?");
    values.push(patch.column_id);
  }
  if (patch.run_id !== undefined) {
    updates.push("run_id = ?");
    values.push(patch.run_id);
  }

  if (updates.length === 0) return existing;

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(cardId);

  db.prepare(`UPDATE kanban_cards SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getCardById(cardId);
}

export function deleteCard(cardId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM kanban_cards WHERE id = ?").run(cardId);
  return result.changes > 0;
}
