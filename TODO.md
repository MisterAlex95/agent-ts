## Roadmap towards a usable agent

## 1. Solidify the current core

- [x] Clarify the API contract of `/tasks` (JSON schema, fields, limits)
- [x] Document the response shape (`memory`, `answer`, `steps`) clearly in the README
- [x] Improve config error handling (QDRANT_URL, missing Ollama models) with explicit messages

## 2. Improve core tools

- [x] Extend file tools:
  - [x] Add `appendFile`
  - [x] Add a patch/diff-style write tool instead of full overwrite
  - [x] Protect paths like `.git`, `node_modules`, `dist`, `*.log`, etc.
- [x] Extend `runCommand`:
  - [x] Whitelist allowed commands (git, npm, pnpm, tests…)
  - [x] Configurable timeout + truncated output
  - [x] Structured output (stdout, stderr, exitCode, duration)

## 3. Git & Node tooling

- [x] Add Git tools:
  - [x] `gitStatus`
  - [x] `gitDiff`
  - [x] `gitLog`
  - [x] (optional, opt-in) `gitCommit(message)`
- [x] Add Node/JS tools:
  - [x] `runTests` (wrap `npm test`)
  - [x] `runLint`
  - [x] `runBuild`
- [x] Centralize these tools in a `devTools` module

## 4. Smarter planner

- [x] Enrich planner prompt with a notion of mini-plan (likely sequence of actions)
- [x] Introduce a `goalType` field in `/tasks` (e.g. `runTestsAndFix`, `addEndpoint`)
- [x] Teach planner when to consider the task DONE (tests green, no errors, no more useful actions)

## 5. More targeted RAG for code

- [x] During indexing:
  - [x] Extract symbols (functions, classes, endpoints) and store in metadata (`symbol`, `kind`)
  - [x] Filter files better (ignore binaries, build outputs, large JSON)
- [x] Add search tools:
  - [x] `searchSymbols(query)` to retrieve relevant symbols directly
  - [x] Make planner choose between `searchSymbols` and `searchCode` depending on the task

## 6. UX (CLI & logs)

- [x] Create a small CLI (`agent`) that wraps the HTTP API:
  - [x] `agent index`
  - [x] `agent run "Refactor X into Y"`
- [x] Improve logs:
  - [x] Structured trace (timestamp, tool, key params, errors)
  - [x] `verbose` option in `/tasks` to control detail level

## 7. Safety & guardrails

- [x] Clearly configure the workspace root and allowed/forbidden directories
- [x] Add a `dryRun` mode:
  - [x] Simulate `writeFile` / `runCommand` and return plan/diff without side effects
- [x] Save backups of files before modification

## 8. Pre-packaged scenarios

- [ ] Implement ready-to-use “modes”:
  - [ ] `improveTypes`: analyze a TS file and propose stricter types
  - [ ] `addEndpoint`: create an Express endpoint + handler + test
  - [ ] `fixTest`: run `npm test`, read errors, locate file, propose a patch
- [ ] Add example `/tasks` requests for each scenario in the README

## 9. Planner robustness

- [x] Harden planner output parsing:
  - [x] Retry with “reply with JSON only” when JSON parse fails
  - [x] Fallback regex to extract `{"tool":..., "params":...}` from raw response
- [ ] Use structured/grammar output from Ollama for planner if supported
- [x] Add few-shot examples in planner prompt for when to say DONE vs continue (e.g. don’t DONE if tests weren’t run when user asked, or if a new file was requested but not written)

## 10. Context & memory

- [x] Improve `relevantContext`: keep last N search results or summarize older ones instead of only the latest
- [x] Summarize older steps in `recentObservations` (e.g. first k-1 steps as one short paragraph, keep last 2–3 in full) to avoid context overflow

## 11. RAG improvements

- [ ] Incremental (or partial) re-index: endpoint or option to index only changed files (e.g. by mtime or hash)
- [ ] Hybrid search: combine semantic (Qdrant) with keyword match on chunk content for better recall on exact names

## 12. UX & performance

- [ ] CLI progress: stream step-by-step output during `agent run` (e.g. “Step 1: searchCode …”, “Step 2: readFile …”) instead of waiting for the end
- [ ] Optional streaming of final answer for long runs
- [x] Global timeout per task (e.g. 5 min) to avoid runaway runs

## 13. Observability & debug

- [x] In verbose mode: log truncated tool output in trace (not only tool + params) for replay/debug
- [ ] Optional metrics: duration per step, total run time, Ollama call count; expose via `GET /metrics` or structured logs

## 14. Code quality & maintainability

- [ ] E2E tests for agent loop with mocked Ollama + Qdrant (simple task → expected tools or DONE)
- [x] Move planner and responder prompts to dedicated files or module (e.g. `src/prompts/`) for easier tuning
