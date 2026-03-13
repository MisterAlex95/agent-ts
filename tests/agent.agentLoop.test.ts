import { vi } from "vitest";

vi.mock("../src/rag/search.js", () => ({ semanticSearch: async () => [] }));
vi.mock("../src/tools/search/index.js", () => ({
  searchCodeTool: vi.fn().mockResolvedValue({ query: "", results: [] }),
  searchSymbolsTool: vi.fn().mockResolvedValue({ query: "", results: [] }),
}));

vi.mock("../src/agent/planning/planner.js", () => ({
  planNextAction: vi.fn(),
  READ_ONLY_TOOLS: [],
}));

vi.mock("../src/agent/responder/index.js", () => ({
  summarizeRun: vi.fn().mockResolvedValue("Mocked final answer"),
}));

vi.mock("../src/agent/planning/inferGoalType.js", () => ({
  inferGoalType: vi.fn().mockResolvedValue("generic"),
}));

const executeToolMock = vi.fn();
vi.mock("../src/agent/execution/actionResolver.js", () => ({
  executeTool: (...args: unknown[]) => executeToolMock(...args),
}));

import { planNextAction } from "../src/agent/planning/planner.js";
import { summarizeRun } from "../src/agent/responder/index.js";
import { runAgentLoop } from "../src/agent/index.js";

describe("agentLoop", () => {
  it("runs steps until planner returns null and produces an answer", async () => {
    executeToolMock.mockResolvedValueOnce({ query: "", results: [] });
    vi.mocked(planNextAction)
      .mockResolvedValueOnce({
        tool: "searchCode",
        description: "Search",
        params: { query: "Inspect the repository" },
      })
      .mockResolvedValueOnce(null);

    const result = await runAgentLoop("Inspect the repository", {
      maxSteps: 5,
    });

    expect(result.finished).toBe(true);
    expect(result.steps).toBe(1);
    expect(result.memory.task).toBe("Inspect the repository");
    expect(result.memory.actions[0].tool).toBe("searchCode");
    expect(summarizeRun).toHaveBeenCalled();
    expect(result.answer).toBe("Mocked final answer");
  });

  it("E2E: runs multiple tool steps in sequence then DONE", async () => {
    executeToolMock
      .mockResolvedValueOnce({ files: ["a", "b"] })
      .mockResolvedValueOnce({ content: "mock content" });

    vi.mocked(planNextAction)
      .mockResolvedValueOnce({
        tool: "listFiles",
        description: "List",
        params: { path: "." },
      })
      .mockResolvedValueOnce({
        tool: "readFile",
        description: "Read",
        params: { path: "package.json" },
      })
      .mockResolvedValueOnce(null);

    const result = await runAgentLoop("List files and read package.json", {
      maxSteps: 5,
    });

    expect(result.finished).toBe(true);
    expect(result.steps).toBe(2);
    expect(result.memory.actions).toHaveLength(2);
    expect(result.memory.actions[0].tool).toBe("listFiles");
    expect(result.memory.actions[0].input).toEqual({ path: "." });
    expect(result.memory.actions[1].tool).toBe("readFile");
    expect(result.memory.actions[1].input).toEqual({ path: "package.json" });
    expect(executeToolMock).toHaveBeenCalledWith("listFiles", { path: "." }, expect.any(Object));
    expect(executeToolMock).toHaveBeenCalledWith("readFile", { path: "package.json" }, expect.any(Object));
    expect(summarizeRun).toHaveBeenCalledWith(
      "List files and read package.json",
      expect.objectContaining({ task: "List files and read package.json", actions: expect.any(Array) }),
    );
  });

  it("E2E: with verbose option includes trace in result", async () => {
    executeToolMock.mockResolvedValueOnce({ status: "clean" });
    vi.mocked(planNextAction)
      .mockResolvedValueOnce({
        tool: "gitStatus",
        description: "Status",
        params: {},
      })
      .mockResolvedValueOnce(null);

    const result = await runAgentLoop("Check git status", {
      maxSteps: 3,
      verbose: true,
    });

    expect(result.finished).toBe(true);
    expect(result.steps).toBe(1);
    expect(result.trace).toBeDefined();
    expect(Array.isArray(result.trace)).toBe(true);
    expect(result.trace!.length).toBe(1);
    expect(result.trace![0].tool).toBe("gitStatus");
  });
});

