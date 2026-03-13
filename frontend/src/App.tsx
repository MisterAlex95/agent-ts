import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { RunsPage } from "./pages/RunsPage";
import { ProjectPage } from "./pages/ProjectPage";
import { FilesPage } from "./pages/FilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AgentRun, MetricsSnapshot, GoalType, RunMode, ServerRunRecord } from "./types";
import { createTaskStream, getHealth, getMetrics, getRecentRuns, cancelTask } from "./api/client";

type PageId = "dashboard" | "runs" | "project" | "files" | "settings";

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [health, setHealth] = useState<"online" | "offline">("offline");
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [serverRuns, setServerRuns] = useState<ServerRunRecord[]>([]);

  useEffect(() => {
    void (async () => {
      const [h, m, sr] = await Promise.all([
        getHealth(),
        getMetrics(),
        getRecentRuns(10),
      ]);
      setHealth(h);
      setMetrics(m);
      setServerRuns(sr);
    })();
  }, []);

  useEffect(() => {
    const id = window.setInterval(async () => {
      const [h, m, sr] = await Promise.all([
        getHealth(),
        getMetrics(),
        getRecentRuns(10),
      ]);
      setHealth(h);
      setMetrics(m);
      setServerRuns(sr);
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  const startRun = useCallback(
    (params: {
      task: string;
      mode: RunMode;
      goalType?: GoalType;
      maxSteps: number;
      verbose: boolean;
      dryRun: boolean;
      timeoutMs?: number;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      continueRunId?: string;
    }) => {
      const isContinue = Boolean(params.continueRunId);
      const id = isContinue ? params.continueRunId! : crypto.randomUUID();

      if (!isContinue) {
        const createdAt = new Date().toISOString();
        const baseRun: AgentRun = {
          id,
          task: params.task,
          mode: params.mode,
          goalType: params.goalType,
          maxSteps: params.maxSteps,
          verbose: params.verbose,
          dryRun: params.dryRun,
          createdAt,
          status: "running",
          steps: [],
        };
        setRuns((prev) => [baseRun, ...prev]);
        setSelectedRunId(id);
        setActivePage("runs");
      } else {
        setRuns((prev) =>
          prev.map((run) =>
            run.id === id
              ? {
                  ...run,
                  status: "running" as const,
                  plannerStream: "",
                  errorMessage: undefined,
                }
              : run,
          ),
        );
      }

      setIsStarting(true);

      const stop = createTaskStream(
        {
          task: params.task,
          mode: params.mode,
          maxSteps: params.maxSteps,
          verbose: params.verbose,
          dryRun: params.dryRun,
          goalType: params.goalType,
          timeoutMs: params.timeoutMs,
          history: params.history,
        },
        {
          onEvent: (ev) => {
            setRuns((prev) =>
              prev.map((run) => {
                if (run.id !== id) return run;
                if (ev.type === "started" && ev.taskId) {
                  return { ...run, taskId: ev.taskId };
                }
                if (ev.type === "planner_delta" && ev.delta) {
                  return {
                    ...run,
                    plannerStream: (run.plannerStream ?? "") + ev.delta,
                  };
                }
                if (ev.type === "answer_delta" && ev.delta) {
                  return {
                    ...run,
                    answer: (run.answer ?? "") + ev.delta,
                  };
                }
                if (ev.type === "step") {
                  const thought = (run.plannerStream ?? "").trim();
                  return {
                    ...run,
                    steps: [...run.steps, ev],
                    stepThoughts: [...(run.stepThoughts ?? []), thought],
                    plannerStream: "",
                  };
                }
                if (ev.type === "done") {
                  const doneEv = ev as {
                    answer?: string;
                    trace?: Array<{
                      timestamp: string;
                      tool: string;
                      params?: unknown;
                      error?: string;
                      outputTruncated?: string;
                    }>;
                  };
                  return {
                    ...run,
                    status: "finished",
                    answer: doneEv.answer ?? run.answer,
                    trace: doneEv.trace,
                  };
                }
                if (ev.type === "error") {
                  return {
                    ...run,
                    status: "error",
                    errorMessage: ev.error ?? "Unknown error",
                  };
                }
                if (ev.type === "cancelled") {
                  return {
                    ...run,
                    status: "cancelled",
                  };
                }
                return run;
              }),
            );
            if (ev.type === "done" || ev.type === "error" || ev.type === "cancelled") {
              setIsStarting(false);
              stop();
            }
          },
        },
      );
    },
    [],
  );

  const activeRun = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;

  let pageNode: React.ReactNode;
  if (activePage === "runs") {
    pageNode = (
      <RunsPage
        runs={runs}
        activeRun={activeRun}
        onSelectRun={setSelectedRunId}
        onCancelRun={(run) => {
          if (run.taskId) void cancelTask(run.taskId);
        }}
        onStartRun={startRun}
        isStarting={isStarting}
      />
    );
  } else if (activePage === "project") {
    pageNode = <ProjectPage />;
  } else if (activePage === "files") {
    pageNode = <FilesPage />;
  } else if (activePage === "settings") {
    pageNode = <SettingsPage />;
  } else {
    pageNode = (
      <DashboardPage
        onStartRun={startRun}
        isStarting={isStarting}
        health={health}
        metrics={metrics}
        recentServerRuns={serverRuns}
        runs={runs}
      />
    );
  }

  return (
    <DashboardLayout
      activePage={activePage}
      onNavigate={setActivePage}
      health={health}
      metrics={metrics}
    >
      {pageNode}
    </DashboardLayout>
  );
};

