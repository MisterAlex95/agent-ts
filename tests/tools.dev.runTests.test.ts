import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTestsTool } from "../src/tools/dev/runTests.js";

vi.mock("../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: "passed", stderr: "", exitCode: 0 }),
}));

describe("runTestsTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs npm test -- --run", async () => {
    const { runWorkspaceCommand } = await import("../src/runtime/commandExecutor.js");
    const result = await runTestsTool();
    expect(runWorkspaceCommand).toHaveBeenCalledWith("npm test -- --run", expect.objectContaining({ timeoutMs: 120_000 }));
    expect(result.exitCode).toBe(0);
  });
});
