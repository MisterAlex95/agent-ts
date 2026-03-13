import { vi } from "vitest";

vi.mock("../src/llm/ollamaClient.js", () => ({
  ollamaChatStream: vi.fn(),
}));

import { planNextAction } from "../src/agent/planning/planner.js";
import { ollamaChatStream } from "../src/llm/ollamaClient.js";

describe("planner", () => {
  it("returns searchCode action when LLM returns searchCode JSON", async () => {
    vi.mocked(ollamaChatStream).mockResolvedValueOnce({
      content: '{"tool":"searchCode","params":{"query":"find API routes"}}',
    });

    const action = await planNextAction({
      task: "Add a new API endpoint",
      recentObservations: "",
      relevantContext: "",
      goalType: "generic",
    });

    expect(action).not.toBeNull();
    expect(action?.tool).toBe("searchCode");
    expect(action?.params).toEqual({ query: "find API routes" });
  });

  it("returns null when LLM returns DONE", async () => {
    vi.mocked(ollamaChatStream).mockResolvedValueOnce({
      content: '{"tool":"DONE","params":{}}',
    });

    const action = await planNextAction({
      task: "Anything",
      recentObservations: "already did something",
      relevantContext: "",
      goalType: "generic",
    });

    expect(action).toBeNull();
  });

  it("returns listFiles action when LLM returns listFiles JSON", async () => {
    vi.mocked(ollamaChatStream).mockResolvedValueOnce({
      content: '{"tool":"listFiles","params":{"path":"."}}',
    });

    const action = await planNextAction({
      task: "List files",
      recentObservations: "",
      relevantContext: "",
      goalType: "generic",
    });

    expect(action?.tool).toBe("listFiles");
    expect(action?.params).toEqual({ path: "." });
  });
});

