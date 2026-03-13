import React from "react";
import type { AgentRun } from "../types";

type RunsPageProps = {
  runs: AgentRun[];
  activeRun: AgentRun | null;
  onSelectRun: (id: string) => void;
};

export const RunsPage: React.FC<RunsPageProps> = ({ runs, activeRun, onSelectRun }) => {
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
              Live timeline of tools and a compact status summary.
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
              </div>
              <div className="run-detail-task" title={activeRun.task}>
                {activeRun.task}
              </div>
            </div>
            <div className="run-timeline" aria-label="Steps timeline">
              {activeRun.steps.length === 0 ? (
                <div className="runs-empty">Waiting for first step…</div>
              ) : (
                activeRun.steps.map((step, idx) => (
                  <div key={idx} className="timeline-row">
                    <span className="timeline-step">{step.step ?? idx + 1}</span>
                    <span className="timeline-tool">{step.tool ?? "?"}</span>
                    {step.error ? (
                      <span className="timeline-error">{step.error}</span>
                    ) : (
                      <span className="timeline-meta">
                        {step.type === "planner_delta" ? "planner" : step.type}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="runs-empty">Select a run in the list.</div>
        )}
      </section>
    </div>
  );
};

