import { AgentMemory } from "../src/agent/memory.js";

describe("AgentMemory", () => {
  it("records observations and snapshots state", () => {
    const memory = new AgentMemory("test task");

    memory.recordObservation({
      tool: "listFiles",
      input: { path: "." },
      output: { files: ["a.ts"] },
    });

    const snapshot = memory.snapshot();

    expect(snapshot.task).toBe("test task");
    expect(snapshot.actions).toHaveLength(1);
    expect(snapshot.actions[0].tool).toBe("listFiles");
    expect(snapshot.actions[0].timestamp).toBeDefined();
  });
});

