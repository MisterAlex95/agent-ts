import React, { useState } from "react";
import type { MetricsSnapshot } from "../../types";

const SIDEBAR_ITEMS: { id: "dashboard" | "runs" | "kanban" | "project" | "files" | "settings"; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "runs", label: "Runs" },
  { id: "kanban", label: "Kanban" },
  { id: "project", label: "Project" },
  { id: "files", label: "Files" },
  { id: "settings", label: "Settings" },
];

type DashboardLayoutProps = {
  children: React.ReactNode;
  activePage: "dashboard" | "runs" | "kanban" | "project" | "files" | "settings";
  onNavigate: (page: "dashboard" | "runs" | "kanban" | "project" | "files" | "settings") => void;
  health: "online" | "offline";
  metrics: MetricsSnapshot | null;
};

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activePage,
  onNavigate,
  health,
  metrics,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const totalRuns = metrics?.totalRuns ?? 0;
  const totalErrors = metrics?.totalErrors ?? 0;

  const handleNav = (page: "dashboard" | "runs" | "kanban" | "project" | "files" | "settings") => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  return (
    <div className={`app-root ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>
      <div
        className="sidebar-backdrop"
        aria-hidden="true"
        onClick={() => setMobileMenuOpen(false)}
      />
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="app-title">Agent</div>
          <div className="app-subtitle">Local coding companion</div>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${item.id === activePage ? "nav-item-active" : ""}`}
              onClick={() => handleNav(item.id)}
            >
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button
            type="button"
            className="topbar-menu-btn"
            aria-label="Open menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="topbar-menu-icon" aria-hidden />
          </button>
          <div className="topbar-heading">
            <div className="topbar-title">Agent dashboard</div>
            <div className="topbar-subtitle">Run, observe and iterate on coding tasks</div>
          </div>
          <div className="topbar-right">
            <span className="status-pill" aria-live="polite">
              <span
                className="status-dot"
                style={{ backgroundColor: health === "online" ? "#22c55e" : "#f97373" }}
              />
              {health === "online" ? "Online" : "Offline"}
            </span>
            <span className="topbar-metric">
              {totalRuns} run{totalRuns === 1 ? "" : "s"}
            </span>
            <span className="topbar-metric topbar-metric-muted">
              {totalErrors} error{totalErrors === 1 ? "" : "s"}
            </span>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
};


