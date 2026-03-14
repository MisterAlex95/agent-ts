# Local autonomous coding assistant platform

## Prerequisites

- Install **Node.js** (LTS)
- Install and run **Ollama** with a coding model (e.g. `qwen2.5-coder` or `deepseek-coder-v2`)
- A **Qdrant** instance (hosted or local); set `QDRANT_URL` in `.env`

## Environment variables

Copy `.env.example` to `.env` and adjust. Summary:

| Variable | Description |
|----------|-------------|
| `QDRANT_URL` | Qdrant server base URL (e.g. `http://localhost:6333`). |
| `QDRANT_COLLECTION` | Qdrant collection name for RAG chunks (default: `repo_chunks`). |
| `EMBEDDING_PROVIDER` | Embedding backend: `ollama`, `openai`, or `claude`. |
| `EMBEDDING_MODEL` | Model used for embeddings (e.g. `nomic-embed-text` for Ollama). |
| `AGENT_BASE_URL` | LLM API base URL (Ollama: `http://localhost:11434`; with `pi` provider, `/v1` is appended for OpenAI-compatible). |
| `AGENT_MODEL` | Chat model name (e.g. `qwen2.5-coder:32b`). |
| `AGENT_LLM_HEADERS_TIMEOUT_MS` | Timeout in ms for LLM HTTP request (default: 120000). |
| `AGENT_LLM_PROVIDER` | `ollama` = direct Ollama client; `pi` = [@mariozechner/pi-ai](https://github.com/badlogic/pi-mono) (multi-provider, native tool calling). |
| `AGENT_USE_PI_AGENT` | `1` = use pi-agent-core for the agent loop; `0` = custom ReAct loop. Requires `AGENT_LLM_PROVIDER=pi` when `1`. |
| `PORT` | HTTP server port (default: 3000). |
| `WORKSPACE_ROOT` | Directory to index and run tools in (default: `./workspace`). |
| `WORKSPACE_FORBIDDEN_DIRS` | Comma-separated dir names never indexed (e.g. `node_modules,.git`). |
| `SQLITE_DB_PATH` | Path to SQLite DB for runs/index metadata (default: `./data/agent.db`). |
| `AGENT_LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` (default: `debug` in dev, `info` in production). |
| `BACKUP_BEFORE_WRITE` | `1` or `true` to backup files before the agent overwrites them. |
| `AGENT_API_URL` | Base URL of the API when using the CLI (default: `http://localhost:3000`). |

## Setup

1. Clone this repository into a local directory.
2. Copy `.env.example` to `.env` and set `QDRANT_URL` (e.g. `https://qdrant.adserver.fr`) and other values as needed.
3. Ensure Ollama is running and the configured model is pulled:
  ```bash
   ollama pull qwen2.5-coder
  ```

## Install dependencies

```bash
npm install
```

## Run the development server

```bash
npm run dev
```

The Express API will start on the configured `PORT` (default 3000).

## How to test

### Unit tests (no Ollama / Qdrant)

```bash
npm test
```

### End-to-end test (Ollama + Qdrant + server)

1. **Ollama** running with chat + embedding models:
  ```bash
   ollama pull qwen2.5-coder
   ollama pull nomic-embed-text
  ```
2. `**.env**` with `QDRANT_URL` (and optionally `AGENT_BASE_URL` if not local).
3. **Put some code in `workspace/`** so the index has something to search:
  ```bash
   echo 'export function hello() { return "world"; }' > workspace/sample.ts
   mkdir -p workspace/src
   echo 'console.log("ok");' > workspace/src/index.ts
  ```
4. **Start the server** (in one terminal):
  ```bash
   npm run dev
  ```
5. **Health check:**
  ```bash
   curl http://localhost:3000/health
  ```
   Expected: `{"status":"ok"}`
6. **Index the workspace** (creates/updates the Qdrant collection):
  ```bash
   curl -X POST http://localhost:3000/index
  ```
   Expected: `{"indexedFiles":2,"indexedChunks":...}` (or similar, with `indexedFiles` ≥ 1).
7. **Run the agent** on a task:
  ```bash
   curl -X POST http://localhost:3000/tasks \
     -H "Content-Type: application/json" \
     -d '{"task": "List all TypeScript files in the project"}'
  ```
   Expected: JSON with `finished: true`, `steps` ≥ 1, and `memory.actions` showing tool calls (e.g. `searchCode`, then `listFiles` or `readFile`, etc.). If something fails (Ollama, Qdrant), the response will have an `error` field.
8. **Optional:** more steps or another task:
  ```bash
   curl -X POST http://localhost:3000/tasks \
     -H "Content-Type: application/json" \
     -d '{"task": "What does sample.ts export?", "maxSteps": 5}'
  ```

## HTTP API reference

### `GET /health`

- **Response 200**
  - `{"status":"ok"}`

### `POST /index`

- **Description**: Parse and index the `workspace/` directory into Qdrant using the configured embedding model.
- **Request body**: none
- **Response 200**
  - `{"indexedFiles": number, "indexedChunks": number}`

### `POST /tasks`

- **Description**: Run the agent loop on a given task.
- **Request body (JSON)**:
  ```json
  {
    "task": "What does sample.ts export?",
    "maxSteps": 5,
    "goalType": "generic"
  }
  ```
  - **task** (string, required): natural language description of the development task.
  - **maxSteps** (number, optional): maximum number of tool steps for this run (default: 8).
  - **goalType** (string, optional): high-level intent for the planner. Values: `generic` (default), `runTestsAndFix`, `addEndpoint`, `improveTypes`.
- **Response 200 (JSON)**:
  ```json
  {
    "finished": true,
    "steps": 2,
    "memory": {
      "task": "What does sample.ts export?",
      "actions": [
        {
          "tool": "listFiles",
          "input": { "path": "." },
          "output": { "root": "./workspace", "files": ["sample.ts", "src/index.ts"] },
          "timestamp": "2026-03-12T20:50:47.171Z"
        },
        {
          "tool": "readFile",
          "input": { "path": "sample.ts" },
          "output": {
            "path": "sample.ts",
            "content": "export function hello() { return \"world\"; }\\n"
          },
          "timestamp": "2026-03-12T20:50:49.123Z"
        }
      ]
    },
    "answer": "`sample.ts` exports a function named `hello` that returns the string \"world\"."
  }
  ```
- **Error responses**:
  - **400**: `{"error": "Missing or invalid 'task' in body"}`
  - **500**: `{"error": "human-readable error message (Ollama, Qdrant, etc.)"}`

### Scenario examples

These examples show how to call the agent with explicit `goalType` for common workflows.

#### Improve TypeScript types (`improveTypes`)

```bash
wcurl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Tighten the types in src/api/routes.ts and fix obvious any/usages.",
    "goalType": "improveTypes",
    "maxSteps": 8
  }'
```

#### Add or modify an API endpoint (`addEndpoint`)

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Add a /projects/:id/tasks endpoint that returns the tasks for a given project.",
    "goalType": "addEndpoint",
    "maxSteps": 10
  }'
```

#### Fix failing tests (`runTestsAndFix`)

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Run the test suite and fix the failing tests until everything passes or is clearly blocked.",
    "goalType": "runTestsAndFix",
    "maxSteps": 12
  }'
```

## High-level architecture

- **Express HTTP API** exposing endpoints to:
  - accept new development tasks
  - trigger repository indexing into Qdrant
  - query agent status
- **Agent loop** that:
  - receives a task
  - retrieves semantic context from Qdrant
  - plans actions
  - calls tools (file operations, search, commands)
  - updates memory and repeats until done
- **RAG pipeline** that:
  - walks the workspace
  - splits files into code chunks
  - gets embeddings via Ollama
  - stores vectors with metadata in Qdrant

