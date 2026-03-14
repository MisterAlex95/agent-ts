import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaultPath = path.join(__dirname, "../../data/runs.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.SQLITE_DB_PATH ?? defaultPath;
    mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT,
      task_preview TEXT,
      goal_type TEXT,
      mode TEXT,
      steps INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      finished INTEGER NOT NULL,
      cancelled INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      timestamp TEXT NOT NULL,
      task TEXT,
      answer TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp);
    CREATE TABLE IF NOT EXISTS index_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_at TEXT NOT NULL,
      indexed_files INTEGER NOT NULL,
      indexed_chunks INTEGER NOT NULL
    );
  `);
  try {
    database.exec("ALTER TABLE runs ADD COLUMN task TEXT");
  } catch {
    // column already exists
  }
  try {
    database.exec("ALTER TABLE runs ADD COLUMN answer TEXT");
  } catch {
    // column already exists
  }

  // Kanban: default board, columns, cards
  database.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      project_path TEXT
    );
    CREATE TABLE IF NOT EXISTS kanban_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL,
      UNIQUE(board_id, slug)
    );
    CREATE TABLE IF NOT EXISTS kanban_cards (
      id TEXT PRIMARY KEY,
      column_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      run_id TEXT,
      FOREIGN KEY (column_id) REFERENCES kanban_columns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON kanban_cards(column_id);
  `);
  try {
    database.exec("ALTER TABLE boards ADD COLUMN project_path TEXT");
  } catch {
    // column already exists
  }
  const boardExists = database.prepare("SELECT 1 FROM boards WHERE id = 1").get();
  if (!boardExists) {
    const now = new Date().toISOString();
    database.prepare("INSERT INTO boards (id, name, created_at, project_path) VALUES (1, 'Default', ?, NULL)").run(now);
    const defaultColumns = [
      [1, "todo", "To Do", 0],
      [1, "in_progress", "In Progress", 1],
      [1, "to_test", "To Test", 2],
      [1, "to_review", "To Review", 3],
      [1, "done", "Done", 4],
    ];
    const insertCol = database.prepare(
      "INSERT INTO kanban_columns (board_id, slug, label, position) VALUES (?, ?, ?, ?)",
    );
    for (const row of defaultColumns) {
      insertCol.run(row[0], row[1], row[2], row[3]);
    }
  }
}

export interface RunRow {
  id: string | null;
  task_preview: string | null;
  goal_type: string | null;
  mode: string | null;
  steps: number;
  duration_ms: number;
  finished: number;
  cancelled: number;
  error: string | null;
  timestamp: string;
  task?: string | null;
  answer?: string | null;
}

export function insertRun(metrics: {
  id?: string;
  taskPreview?: string;
  goalType?: string;
  mode?: string;
  steps: number;
  durationMs: number;
  finished: boolean;
  cancelled?: boolean;
  error?: string;
  task?: string;
  answer?: string | null;
}): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO runs (id, task_preview, goal_type, mode, steps, duration_ms, finished, cancelled, error, timestamp, task, answer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    metrics.id ?? null,
    metrics.taskPreview ?? null,
    metrics.goalType ?? null,
    metrics.mode ?? null,
    metrics.steps,
    metrics.durationMs,
    metrics.finished ? 1 : 0,
    metrics.cancelled ? 1 : 0,
    metrics.error ?? null,
    new Date().toISOString(),
    metrics.task ?? null,
    metrics.answer ?? null,
  );
}

export function getRunById(id: string): RunRow | null {
  const database = getDb();
  const row = database
    .prepare(
      "SELECT id, task_preview, goal_type, mode, steps, duration_ms, finished, cancelled, error, timestamp, task, answer FROM runs WHERE id = ? LIMIT 1",
    )
    .get(id) as RunRow | undefined;
  return row ?? null;
}

export function getRecentRunsFromDb(limit: number): RunRow[] {
  const database = getDb();
  const stmt = database.prepare(
    "SELECT id, task_preview, goal_type, mode, steps, duration_ms, finished, cancelled, error, timestamp FROM runs ORDER BY timestamp DESC LIMIT ?",
  );
  return stmt.all(limit) as RunRow[];
}

export function getMetricsFromDb(): {
  lastRun: RunRow | null;
  totalRuns: number;
  totalErrors: number;
  recentRunsCount: number;
} {
  const database = getDb();
  const last = database
    .prepare(
      "SELECT id, task_preview, goal_type, mode, steps, duration_ms, finished, cancelled, error, timestamp FROM runs ORDER BY timestamp DESC LIMIT 1",
    )
    .get() as RunRow | undefined;
  const totals = database
    .prepare("SELECT COUNT(*) as total, SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) as errors FROM runs")
    .get() as { total: number; errors: number };
  const recentCount = database.prepare("SELECT COUNT(*) as c FROM (SELECT 1 FROM runs ORDER BY timestamp DESC LIMIT 50)").get() as { c: number };
  return {
    lastRun: last ?? null,
    totalRuns: totals?.total ?? 0,
    totalErrors: totals?.errors ?? 0,
    recentRunsCount: recentCount?.c ?? 0,
  };
}

export interface IndexStateRow {
  last_at: string;
  indexed_files: number;
  indexed_chunks: number;
}

export function recordIndexRun(indexedFiles: number, indexedChunks: number): void {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      "INSERT OR REPLACE INTO index_state (id, last_at, indexed_files, indexed_chunks) VALUES (1, ?, ?, ?)",
    )
    .run(now, indexedFiles, indexedChunks);
}

export function getIndexStatus(): IndexStateRow | null {
  const database = getDb();
  const row = database
    .prepare("SELECT last_at, indexed_files, indexed_chunks FROM index_state WHERE id = 1")
    .get() as IndexStateRow | undefined;
  return row ?? null;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
