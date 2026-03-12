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

- [ ] Clearly configure the workspace root and allowed/forbidden directories
- [ ] Add a `dryRun` mode:
  - [ ] Simulate `writeFile` / `runCommand` and return plan/diff without side effects
- [ ] Save backups of files before modification

## 8. Pre-packaged scenarios

- [ ] Implement ready-to-use “modes”:
  - [ ] `improveTypes`: analyze a TS file and propose stricter types
  - [ ] `addEndpoint`: create an Express endpoint + handler + test
  - [ ] `fixTest`: run `npm test`, read errors, locate file, propose a patch
- [ ] Add example `/tasks` requests for each scenario in the README
