import { vi } from "vitest";

vi.mock("../src/rag/search.js", () => ({ semanticSearch: async () => [] }));

vi.mock("../src/agent/planner.js", () => ({
  planNextAction: vi.fn()
    .mockResolvedValueOnce({
      tool: "searchCode",
      description: "Search",
      params: { query: "Inspect the repository" },
    })
    .mockResolvedValueOnce(null),
}));

vi.mock("../src/agent/responder.js", () => ({
  summarizeRun: vi.fn().mockResolvedValue("Mocked final answer"),
}));

import { summarizeRun } from "../src/agent/responder.js";
import { runAgentLoop } from "../src/agent/agentLoop.js";

describe("agentLoop", () => {
  it("runs steps until planner returns null and produces an answer", async () => {
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
});

