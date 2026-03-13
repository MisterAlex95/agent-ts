import React, { useEffect, useState } from "react";

const STORAGE_KEY = "agent-dashboard-preferences";

type Preferences = {
  apiBaseUrl: string;
  defaultMaxSteps: number;
};

function loadPrefs(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        apiBaseUrl: window.location.origin,
        defaultMaxSteps: 12,
      };
    }
    return JSON.parse(raw) as Preferences;
  } catch {
    return {
      apiBaseUrl: window.location.origin,
      defaultMaxSteps: 12,
    };
  }
}

export const SettingsPage: React.FC = () => {
  const [prefs, setPrefs] = useState<Preferences>(() => loadPrefs());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Settings</h2>
          <p className="card-subtitle">
            Simple frontend preferences stored locally; the legacy HTML UI at <code>/</code>{" "}
            continues to work while the SPA matures.
          </p>
        </div>
      </header>
      <div className="field-group">
        <label className="field-label" htmlFor="apiBaseUrl">
          API base URL
        </label>
        <input
          id="apiBaseUrl"
          className="input"
          value={prefs.apiBaseUrl}
          onChange={(e) =>
            setPrefs((prev) => ({
              ...prev,
              apiBaseUrl: e.target.value,
            }))
          }
        />
        <p className="field-hint">
          For now the SPA talks to the same origin as the backend (
          {window.location.origin}). This value is kept locally if you want to point the UI to a
          remote agent later.
        </p>
      </div>
      <div className="field-group" style={{ marginTop: "1rem" }}>
        <label className="field-label" htmlFor="defaultMaxSteps">
          Default max steps
        </label>
        <input
          id="defaultMaxSteps"
          type="number"
          min={1}
          max={64}
          className="input"
          value={prefs.defaultMaxSteps}
          onChange={(e) =>
            setPrefs((prev) => ({
              ...prev,
              defaultMaxSteps: Number(e.target.value) || 12,
            }))
          }
        />
      </div>
    </section>
  );
};


