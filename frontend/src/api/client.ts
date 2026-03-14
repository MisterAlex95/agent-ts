import type {
  MetricsSnapshot,
  StepEvent,
  GoalType,
  RunMode,
  ServerRunRecord,
} from "../types";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TaskRequestBody {
  task: string;
  mode: RunMode;
  maxSteps: number;
  verbose: boolean;
  dryRun: boolean;
  goalType?: GoalType;
  timeoutMs?: number;
  /** Last N messages for multi-turn context (capped server-side) */
  history?: ConversationMessage[];
}

export interface StreamCallbacks {
  onEvent: (event: StepEvent) => void;
}

export async function getHealth(): Promise<"online" | "offline"> {
  try {
    const res = await fetch("/health");
    return res.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

export async function getMetrics(): Promise<MetricsSnapshot | null> {
  try {
    const res = await fetch("/metrics");
    if (!res.ok) return null;
    return (await res.json()) as MetricsSnapshot;
  } catch {
    return null;
  }
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

export async function listProjectFiles(path = "."): Promise<{ root: string; entries: WorkspaceEntry[] }> {
  const params = new URLSearchParams({ path });
  const res = await fetch(`/files/list?${params.toString()}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `List failed: ${res.status}`);
  }
  return res.json() as Promise<{ root: string; entries: WorkspaceEntry[] }>;
}

export async function readProjectFile(path: string): Promise<string> {
  const params = new URLSearchParams({ path });
  const res = await fetch(`/files/read?${params.toString()}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Read failed: ${res.status}`);
  }
  return res.text();
}

export interface IndexStatus {
  lastIndexedAt: string | null;
  indexedFiles: number;
  indexedChunks: number;
}

export async function getIndexStatus(): Promise<IndexStatus | null> {
  try {
    const res = await fetch("/index/status");
    if (!res.ok) return null;
    return (await res.json()) as IndexStatus;
  } catch {
    return null;
  }
}

export async function getRunById(id: string): Promise<ServerRunRecord | null> {
  try {
    const res = await fetch(`/runs/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as ServerRunRecord;
  } catch {
    return null;
  }
}

export async function getRecentRuns(limit = 10): Promise<ServerRunRecord[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    const res = await fetch(`/runs?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { runs?: ServerRunRecord[] };
    return Array.isArray(data.runs) ? data.runs : [];
  } catch {
    return [];
  }
}

export async function cancelTask(taskId: string): Promise<boolean> {
  try {
    const res = await fetch(`/tasks/${taskId}`, { method: "DELETE" });
    if (res.status === 202) {
      const data = (await res.json()) as { cancelled?: boolean };
      return data.cancelled === true;
    }
    return false;
  } catch {
    return false;
  }
}

export function createTaskStream(body: TaskRequestBody, callbacks: StreamCallbacks): () => void {
  const controller = new AbortController();

  (async () => {
    const res = await fetch("/tasks/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.body) {
      callbacks.onEvent({ type: "error", error: "No stream body" });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const chunk of parts) {
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const data = JSON.parse(line.slice(6)) as StepEvent;
          callbacks.onEvent(data);
        } catch {
          callbacks.onEvent({ type: "error", error: "Invalid stream data" });
        }
      }
    }
  })().catch((err: unknown) => {
    callbacks.onEvent({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return () => controller.abort();
}

// Kanban
export interface KanbanBoardSummary {
  id: number;
  name: string;
  created_at: string;
  project_path: string | null;
}

export interface KanbanCard {
  id: string;
  column_id: number;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  run_id: string | null;
}

export interface KanbanColumnWithCards {
  id: number;
  board_id: number;
  slug: string;
  label: string;
  position: number;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  id: number;
  name: string;
  created_at: string;
  project_path: string | null;
  columns: KanbanColumnWithCards[];
}

export async function getKanbanBoards(): Promise<KanbanBoardSummary[]> {
  try {
    const res = await fetch("/kanban/boards");
    if (!res.ok) return [];
    const data = (await res.json()) as { boards?: KanbanBoardSummary[] };
    return Array.isArray(data.boards) ? data.boards : [];
  } catch {
    return [];
  }
}

export async function getKanbanBoard(boardId?: number): Promise<KanbanBoard | null> {
  try {
    const url = boardId != null ? `/kanban/board/${boardId}` : "/kanban/board";
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as KanbanBoard;
  } catch {
    return null;
  }
}

export async function createKanbanBoard(name: string, projectPath?: string | null): Promise<KanbanBoard> {
  const res = await fetch("/kanban/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, project_path: projectPath ?? undefined }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Create board failed: ${res.status}`);
  }
  return res.json() as Promise<KanbanBoard>;
}

export async function updateKanbanBoard(
  id: number,
  patch: { name?: string; project_path?: string | null },
): Promise<KanbanBoard> {
  const res = await fetch(`/kanban/boards/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Update board failed: ${res.status}`);
  }
  return res.json() as Promise<KanbanBoard>;
}

export interface AiCardsResponse {
  created: KanbanCard[];
  error?: string;
}

export async function generateKanbanCardsWithAi(
  boardId: number,
  prompt: string,
): Promise<AiCardsResponse> {
  const res = await fetch(`/kanban/boards/${boardId}/ai-cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.trim() || undefined }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Generate cards failed: ${res.status}`);
  }
  return res.json() as Promise<AiCardsResponse>;
}

export async function createKanbanCard(params: {
  title: string;
  description?: string;
  column_id?: number;
  column_slug?: string;
  board_id?: number;
}): Promise<KanbanCard> {
  const res = await fetch("/kanban/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Create card failed: ${res.status}`);
  }
  return res.json() as Promise<KanbanCard>;
}

export async function updateKanbanCard(
  id: string,
  patch: { title?: string; description?: string; column_id?: number },
): Promise<KanbanCard> {
  const res = await fetch(`/kanban/cards/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Update card failed: ${res.status}`);
  }
  return res.json() as Promise<KanbanCard>;
}

export async function deleteKanbanCard(id: string): Promise<void> {
  const res = await fetch(`/kanban/cards/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Delete card failed: ${res.status}`);
  }
}

export interface KanbanSchedulerRunOnceResult {
  ran: boolean;
  cardId?: string;
  runId?: string;
  error?: string;
}

export interface KanbanSchedulerStatus {
  busy: boolean;
  cardId: string | null;
  runId: string | null;
}

export async function getKanbanSchedulerStatus(): Promise<KanbanSchedulerStatus> {
  const res = await fetch("/kanban/scheduler/status");
  if (!res.ok) return { busy: false, cardId: null, runId: null };
  return res.json() as Promise<KanbanSchedulerStatus>;
}

export async function triggerSchedulerRunOnce(): Promise<KanbanSchedulerRunOnceResult> {
  const res = await fetch("/kanban/scheduler/run-once", { method: "POST" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Scheduler run-once failed: ${res.status}`);
  }
  return res.json() as Promise<KanbanSchedulerRunOnceResult>;
}

