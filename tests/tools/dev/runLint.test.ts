import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLintTool } from "../../../src/tools/dev/runLint.js";

vi.mock("../../../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

describe("runLintTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs npm run lint", async () => {
    const { runWorkspaceCommand } = await import("../../../src/runtime/commandExecutor.js");
    await runLintTool();
    expect(runWorkspaceCommand).toHaveBeenCalledWith("npm run lint", expect.any(Object));
  });
});
