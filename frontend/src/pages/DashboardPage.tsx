import React, { useCallback, useState } from "react";
import type { AgentRun, GoalType, MetricsSnapshot, RunMode, ServerRunRecord } from "../types";
import { getRunById } from "../api/client";

type DashboardPageProps = {
  onStartRun: (params: {
    task: string;
    mode: RunMode;
    goalType?: GoalType;
    maxSteps: number;
    verbose: boolean;
    dryRun: boolean;
    timeoutMs?: number;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  }) => void;
  isStarting: boolean;
  health: "online" | "offline";
  metrics: MetricsSnapshot | null;
  recentServerRuns: ServerRunRecord[];
  runs: AgentRun[];
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onStartRun,
  isStarting,
  health,
  metrics,
  recentServerRuns,
  runs,
}) => {
  const [task, setTask] = useState("");
  const [mode, setMode] = useState<RunMode>("Agent");
  const [goalType, setGoalType] = useState<GoalType | "auto">("auto");
  const [maxSteps, setMaxSteps] = useState(12);
  const [verbose, setVerbose] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [runDetail, setRunDetail] = useState<ServerRunRecord | null>(null);

  const openRunDetail = useCallback(async (id: string) => {
    const r = await getRunById(id);
    setRunDetail(r ?? null);
  }, []);

  const submit = useCallback(() => {
    const trimmed = task.trim();
    if (!trimmed || isStarting) return;
    const lastRun = runs[0];
    const history =
      lastRun?.status === "finished" && lastRun?.answer
        ? [
            { role: "user" as const, content: lastRun.task },
            { role: "assistant" as const, content: lastRun.answer },
          ]
        : undefined;
    onStartRun({
      task: trimmed,
      mode,
      goalType: goalType === "auto" ? undefined : goalType,
      maxSteps,
      verbose,
      dryRun,
      history,
    });
  }, [task, isStarting, onStartRun, mode, goalType, maxSteps, verbose, dryRun, runs]);

  const totalRuns = metrics?.totalRuns ?? 0;
  const last = metrics?.lastRun ?? null;

  return (
    <div className="dashboard-grid">
      <section className="card">
        <header className="card-header">
          <div>
            <h2 className="card-title">New task</h2>
            <p className="card-subtitle">
              Ask the agent to work on your local project. It will read files, run commands and
              apply edits.
            </p>
          </div>
        </header>
        <div className="field-group">
          <label htmlFor="task" className="field-label">
            Task
          </label>
          <textarea
            id="task"
            className="textarea"
            placeholder='e.g. "Tighten types in src/api/routes.ts and fix obvious any/usages"'
            rows={6}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <p className="field-hint">
            Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> to run.
          </p>
        </div>
        <div className="options-row">
          <div className="options-group">
            <label className="field-label" htmlFor="mode">
              Mode
            </label>
            <select
              id="mode"
              className="select"
              value={mode}
              onChange={(e) => setMode(e.target.value as RunMode)}
            >
              <option value="Agent">Agent</option>
              <option value="Plan">Plan</option>
              <option value="Ask">Ask</option>
            </select>
          </div>
          <div className="options-group">
            <label className="field-label" htmlFor="goalType">
              Goal type
            </label>
            <select
              id="goalType"
              className="select"
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as GoalType | "auto")}
            >
              <option value="auto">auto</option>
              <option value="generic">generic</option>
              <option value="runTestsAndFix">runTestsAndFix</option>
              <option value="addEndpoint">addEndpoint</option>
              <option value="improveTypes">improveTypes</option>
            </select>
          </div>
          <div className="options-group">
            <label className="field-label" htmlFor="maxSteps">
              Max steps
            </label>
            <input
              id="maxSteps"
              type="number"
              min={1}
              max={64}
              className="input"
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value) || 12)}
            />
          </div>
          <div className="options-checkboxes">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={verbose}
                onChange={(e) => setVerbose(e.target.checked)}
              />
              Verbose
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              Dry run
            </label>
          </div>
          <div className="options-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!task.trim() || isStarting}
              onClick={submit}
            >
              {isStarting ? "Starting…" : "Run"}
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h2 className="card-title">Environment</h2>
            <p className="card-subtitle">Quick view of server health and last run.</p>
          </div>
        </header>
        <div className="env-grid">
          <div>
            <div className="env-label">Server</div>
            <div className="env-value">
              {health === "online" ? "Online" : "Offline"}
            </div>
          </div>
          <div>
            <div className="env-label">Total runs</div>
            <div className="env-value">{totalRuns}</div>
          </div>
          <div>
            <div className="env-label">Last run</div>
            <div className="env-value">
              {last
                ? `${last.steps} steps • ${(last.durationMs / 1000).toFixed(1)}s`
                : "—"}
            </div>
          </div>
          <div>
            <div className="env-label">Workspace</div>
            <div className="env-value">./workspace</div>
          </div>
        </div>
        <div className="server-runs">
          <div className="server-runs-header">
            <span className="env-label">Recent server runs</span>
          </div>
          {recentServerRuns.length === 0 ? (
            <div className="server-runs-empty">No server runs recorded yet.</div>
          ) : (
            <ul className="server-runs-list">
              {recentServerRuns.slice(0, 5).map((run) => {
                const label =
                  run.taskPreview && run.taskPreview.length > 60
                    ? `${run.taskPreview.slice(0, 60)}…`
                    : run.taskPreview ?? "(no task)";
                const status = run.error
                  ? "error"
                  : run.cancelled
                  ? "cancelled"
                  : run.finished
                  ? "finished"
                  : "running";
                return (
                  <li key={`${run.timestamp}-${run.id ?? label}`} className="server-run-row">
                    <span className={`server-run-status server-run-status-${status}`} />
                    <span className="server-run-text" title={run.taskPreview}>
                      {label}
                    </span>
                    <span className="server-run-meta">
                      {((run.durationMs ?? 0) / 1000).toFixed(1)}s • {run.steps} steps
                    </span>
                    {run.id && (
                      <button
                        type="button"
                        className="server-run-view"
                        onClick={() => void openRunDetail(run.id!)}
                      >
                        View
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
      {runDetail && (
        <div
          className="run-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Run detail"
          onClick={() => setRunDetail(null)}
        >
          <div className="run-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="run-detail-modal-header">
              <h3>Run detail</h3>
              <button type="button" className="run-detail-close" onClick={() => setRunDetail(null)}>
                ×
              </button>
            </div>
            {runDetail.task && (
              <div className="run-detail-section">
                <h4>Task</h4>
                <pre className="run-detail-content">{runDetail.task}</pre>
              </div>
            )}
            {runDetail.answer != null && runDetail.answer !== "" && (
              <div className="run-detail-section">
                <h4>Answer</h4>
                <pre className="run-detail-content">{runDetail.answer}</pre>
              </div>
            )}
            {(!runDetail.task && !runDetail.answer) && (
              <p className="run-detail-empty">No task or answer stored for this run.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


