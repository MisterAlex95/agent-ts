# Roadmap – local-autonomous-coding-assistant

Prioritized backlog. Done items removed; focus on what remains and lessons from code review.

---

## P0 – Critical (do first)

- [x] **E2E tests**  
  Agent loop tests with mocked planner/RAG/responder/executeTool: assert tool sequence and DONE. See `tests/agent.agentLoop.test.ts`.

- [x] **Build script**  
  Replaced with `scripts/copy-templates.mjs` (ESM-safe). Note: `tsc` may still fail on pre-existing TS options (allowImportingTsExtensions) or types (Dirent); fix tsconfig/workspaceManager separately if needed.

- [x] **CLI streaming**  
  `agent run` uses `POST /tasks/stream` by default; use `--no-stream` for blocking. Steps and planner deltas (with `--verbose`) print as they arrive.

---

## P1 – Important (reliability & UX)

- [x] **Task cancellation**  
  `POST /tasks/stream` returns `taskId` in first SSE event `{ type: "started", taskId }`. `DELETE /tasks/:id` aborts that run. Agent loop accepts `signal?: AbortSignal` and returns `cancelled: true` when aborted.

- [x] **Observability / metrics**  
  `GET /metrics` returns `{ lastRun: { steps, durationMs, finished, cancelled?, timestamp }, totalRuns }`. Recorded after each `/tasks` and `/tasks/stream` run.

- [x] **Index state**  
  `indexWorkspaceIncremental()` now runs a full index when no state file exists (first run or after clone), then returns that result.

- [x] **Timeout on stream**  
  On timeout, stream sends `{ type: "timeout", error: "..." }` before closing. On cancel, sends `{ type: "cancelled" }`.

---

## P2 – Quality & maintainability

- [x] **Single source of truth for tools**  
  `src/tools/registry.ts`: TOOL_DEFS (name, params, readOnly, dryRunOnly), READ_ONLY_TOOLS, DRY_RUN_TOOLS, EXECUTABLE_TOOL_NAMES, getToolsForPlanner(). Planner and actionResolver import from registry.

- [x] **Goal type**  
  Planner user prompt includes goal-specific hints (runTestsAndFix → runTests early, then readFile/editLines; addEndpoint → find routes then add; improveTypes → locate file then searchReplace/editLines).

- [ ] **Planner: structured/grammar output**  
  When Ollama (or another provider) supports constrained output, use it for `{ tool, params }` to avoid JSON parse retries and regex fallbacks.

---

## P3 – Scenarios & polish

- [x] **Pre-packaged scenarios**  
  Implement and document: `improveTypes`, `addEndpoint`, `fixTest` (run tests → read errors → patch). Add example `POST /tasks` bodies in README.

- [ ] **Stream final answer**  
  Optional streaming of the summarizer output for long runs so the user sees the answer as it’s generated.

- [ ] **LLM provider abstraction**  
  Abstract “LLM for planning / summarization” so a second provider or fallback (e.g. “reply DONE”) can be plugged in without touching the loop. Reduces single point of failure.

- [ ] **Public UI**  
  Refactor `public/app.js`: modularize or small framework so history, diff view, and new options are easier to add and test.

---

## Notes (no task, just context)

- **Memory**: `AgentMemory` is per-run only (run transcript). No persistence across sessions. Fine for “local assistant”; naming could be clarified (e.g. “RunTranscript”) if it ever gets confused with long-term memory.
- **Context**: Large files are only seen via RAG snippets and tool output caps. For “refactor this huge file,” either document the limitation or consider chunked reads / summarization later.
- **One tool per step**: Current design is one `{ tool, params }` per turn. Keeps protocol simple but increases steps for multi-step tasks; batching or “mini-plan” is a possible future improvement.
