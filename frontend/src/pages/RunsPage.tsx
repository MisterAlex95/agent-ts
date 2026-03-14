import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRun, GoalType, RunMode, ServerRunRecord } from "../types";
import {
  getStepBlockType,
  ThinkingBlock,
  ExplorationBlock,
  FileChangeBlock,
  CommandBlock,
  OtherBlock,
} from "../components/feed";

type RunsPageProps = {
  runs: AgentRun[];
  activeRun: AgentRun | null;
  serverRunDetail: ServerRunRecord | null;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onCancelRun?: (run: AgentRun) => void;
  onStartRun?: (params: {
    task: string;
    mode: RunMode;
    goalType?: GoalType;
    maxSteps: number;
    verbose: boolean;
    dryRun: boolean;
    timeoutMs?: number;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    /** When set, continue this run (same conversation) instead of creating a new one */
    continueRunId?: string;
  }) => void;
  isStarting?: boolean;
};

export const RunsPage: React.FC<RunsPageProps> = ({
  runs,
  activeRun,
  serverRunDetail,
  selectedRunId,
  onSelectRun,
  onCancelRun,
  onStartRun,
  isStarting = false,
}) => {
  const [promptInput, setPromptInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const stepEvents = activeRun?.steps?.filter((s) => s.type === "step") ?? [];
  const stepThoughts = activeRun?.stepThoughts ?? [];
  const hasStreamingThought = (activeRun?.plannerStream ?? "").trim().length > 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [
    stepEvents.length,
    hasStreamingThought,
    activeRun?.answer,
    activeRun?.plannerStream,
  ]);

  const submitPrompt = useCallback(() => {
    const trimmed = promptInput.trim();
    if (!trimmed || !onStartRun || isStarting) return;
    const history =
      activeRun?.answer != null && activeRun.answer !== ""
        ? [
            { role: "user" as const, content: activeRun.task },
            { role: "assistant" as const, content: activeRun.answer },
          ]
        : undefined;
    onStartRun({
      task: trimmed,
      mode: "Agent",
      maxSteps: 12,
      verbose: activeRun?.verbose ?? false,
      dryRun: activeRun?.dryRun ?? false,
      history,
      continueRunId: activeRun?.id ?? undefined,
    });
    setPromptInput("");
  }, [promptInput, onStartRun, isStarting, activeRun]);

  return (
    <div className="runs-layout">
      <section className="card runs-list-card">
        <header className="card-header">
          <div>
            <h2 className="card-title">Runs</h2>
            <p className="card-subtitle">History of recent agent runs.</p>
          </div>
        </header>
        <div className="runs-table" aria-label="Runs list">
          {runs.length === 0 ? (
            <div className="runs-empty">No runs yet. Trigger a task from the dashboard.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Mode</th>
                  <th>Goal</th>
                  <th>Status</th>
                  <th>Steps</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const isActive = activeRun?.id === run.id;
                  const shortTask =
                    run.task.length > 72 ? `${run.task.slice(0, 72)}…` : run.task;
                  return (
                    <tr
                      key={run.id}
                      className={isActive ? "run-row-active" : undefined}
                      onClick={() => onSelectRun(run.id)}
                    >
                      <td title={run.task}>{shortTask}</td>
                      <td>{run.mode}</td>
                      <td>{run.goalType ?? "auto"}</td>
                      <td>{run.status}</td>
                      <td>{run.steps.length}</td>
                      <td>{new Date(run.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
      <section className="card run-detail-card">
        <header className="card-header">
          <div>
            <h2 className="card-title">Run detail</h2>
            <p className="card-subtitle">
              Step-by-step feed: thoughts, explorations, file changes, commands.
            </p>
          </div>
        </header>
        {activeRun ? (
          <div className="run-detail">
            <div className="run-detail-header">
              <div className="run-detail-status">
                <span className={`run-status-pill run-status-${activeRun.status}`}>
                  {activeRun.status}
                </span>
                <span className="run-detail-meta">
                  {activeRun.mode} • {activeRun.goalType ?? "auto"}
                </span>
                {activeRun.status === "running" &&
                  activeRun.taskId &&
                  onCancelRun && (
                    <button
                      type="button"
                      className="run-cancel-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelRun(activeRun);
                      }}
                    >
                      Cancel
                    </button>
                  )}
              </div>
              <div className="run-detail-task" title={activeRun.task}>
                {activeRun.task}
              </div>
            </div>

            <div ref={scrollRef} className="run-detail-scroll" aria-label="Steps and answer">
              <div className="run-feed" aria-label="Steps feed">
                {stepEvents.length === 0 && !hasStreamingThought ? (
                  <div className="runs-empty">Waiting for first step…</div>
                ) : (
                  <>
                    {stepEvents.map((step, idx) => (
                      <div key={idx} className="feed-step-group feed-step-block">
                        {stepThoughts[idx] && (
                          <ThinkingBlock
                            text={stepThoughts[idx] ?? ""}
                            verbose={activeRun?.verbose ?? false}
                          />
                        )}
                        {getStepBlockType(step.tool) === "exploration" && (
                          <ExplorationBlock
                            tool={step.tool ?? ""}
                            params={step.params}
                            result={step.result}
                          />
                        )}
                        {getStepBlockType(step.tool) === "file_change" && (
                          <FileChangeBlock
                            tool={step.tool ?? ""}
                            params={step.params}
                            display={step.display}
                          />
                        )}
                        {getStepBlockType(step.tool) === "command" && (
                          <CommandBlock
                            tool={step.tool ?? ""}
                            params={step.params}
                          />
                        )}
                        {getStepBlockType(step.tool) === "other" && (
                          <OtherBlock
                            tool={step.tool ?? "?"}
                            params={step.params}
                          />
                        )}
                        {step.error && (
                          <span className="timeline-error">{step.error}</span>
                        )}
                      </div>
                    ))}
                    {hasStreamingThought && (
                      <div className="feed-step-group feed-step-block">
                        <ThinkingBlock
                          text={activeRun.plannerStream ?? ""}
                          verbose={activeRun?.verbose ?? false}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              {activeRun.answer != null && activeRun.answer !== "" && (
                <div className="run-answer" aria-label="Final answer">
                  <h3 className="run-answer-title">Answer</h3>
                  <pre className="run-answer-content">{activeRun.answer}</pre>
                </div>
              )}
            </div>
            {activeRun.trace && activeRun.trace.length > 0 && (
              <details className="run-trace-details">
                <summary className="run-trace-summary">Trace (verbose)</summary>
                <ul className="run-trace-list">
                  {activeRun.trace.map((entry, idx) => (
                    <li key={idx} className="run-trace-entry">
                      <span className="run-trace-meta">
                        {entry.timestamp} • {entry.tool}
                      </span>
                      {entry.params != null && (
                        <pre className="run-trace-params">
                          {JSON.stringify(entry.params, null, 2)}
                        </pre>
                      )}
                      {entry.error && (
                        <span className="timeline-error">{entry.error}</span>
                      )}
                      {entry.outputTruncated && (
                        <pre className="run-trace-output">
                          {entry.outputTruncated}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {onStartRun && (
              <div className="run-feed-input-wrap">
                <textarea
                  className="feed-input textarea"
                  placeholder="Plan, @ for context, / for commands"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitPrompt();
                    }
                  }}
                  disabled={isStarting}
                  rows={2}
                />
                <button
                  type="button"
                  className="primary-button feed-input-btn"
                  onClick={submitPrompt}
                  disabled={!promptInput.trim() || isStarting}
                >
                  {isStarting ? "Starting…" : "Run"}
                </button>
              </div>
            )}
          </div>
        ) : serverRunDetail && selectedRunId === serverRunDetail.id ? (
          <div className="run-detail">
            <div className="run-detail-header">
              <div className="run-detail-status">
                <span className={`run-status-pill run-status-${serverRunDetail.finished ? (serverRunDetail.cancelled ? "cancelled" : "done") : "running"}`}>
                  {serverRunDetail.finished ? (serverRunDetail.cancelled ? "cancelled" : "done") : "running"}
                </span>
                <span className="run-detail-meta">
                  {serverRunDetail.mode ?? "Agent"} • {serverRunDetail.goalType ?? "auto"} • {serverRunDetail.steps} steps • {serverRunDetail.durationMs != null ? `${Math.round(serverRunDetail.durationMs / 1000)}s` : ""}
                </span>
              </div>
              <div className="run-detail-task" title={serverRunDetail.task ?? serverRunDetail.taskPreview ?? ""}>
                {serverRunDetail.task ?? serverRunDetail.taskPreview ?? "—"}
              </div>
              <p className="run-detail-scheduler-note">Run from Kanban scheduler. Step-by-step trace is not stored.</p>
            </div>
            <div className="run-detail-scroll" aria-label="Steps and answer">
              {serverRunDetail.error && (
                <div className="run-answer">
                  <h3 className="run-answer-title">Error</h3>
                  <pre className="run-answer-content timeline-error">{serverRunDetail.error}</pre>
                </div>
              )}
              {serverRunDetail.answer != null && serverRunDetail.answer !== "" && (
                <div className="run-answer" aria-label="Final answer">
                  <h3 className="run-answer-title">Answer</h3>
                  <pre className="run-answer-content">{serverRunDetail.answer}</pre>
                </div>
              )}
              {!serverRunDetail.error && (!serverRunDetail.answer || serverRunDetail.answer === "") && (
                <div className="runs-empty">No answer recorded for this run.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="runs-empty">Select a run in the list or open one from a Kanban card (View run).</div>
        )}
      </section>
    </div>
  );
};
