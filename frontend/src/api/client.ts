import type {
  MetricsSnapshot,
  StepEvent,
  GoalType,
  RunMode,
  ServerRunRecord,
} from "../types";

export interface TaskRequestBody {
  task: string;
  mode: RunMode;
  maxSteps: number;
  verbose: boolean;
  dryRun: boolean;
  goalType?: GoalType;
  timeoutMs?: number;
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

