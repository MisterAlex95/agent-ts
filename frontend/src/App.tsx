import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { RunsPage } from "./pages/RunsPage";
import { ProjectPage } from "./pages/ProjectPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AgentRun, MetricsSnapshot, GoalType, RunMode, ServerRunRecord } from "./types";
import { createTaskStream, getHealth, getMetrics, getRecentRuns } from "./api/client";

type PageId = "dashboard" | "runs" | "project" | "settings";

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
    }) => {
      const id = crypto.randomUUID();
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
        },
        {
          onEvent: (ev) => {
            setRuns((prev) =>
              prev.map((run) => {
                if (run.id !== id) return run;
                if (ev.type === "step") {
                  return {
                    ...run,
                    steps: [...run.steps, ev],
                  };
                }
                if (ev.type === "done") {
                  return {
                    ...run,
                    status: "finished",
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
      />
    );
  } else if (activePage === "project") {
    pageNode = <ProjectPage />;
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

