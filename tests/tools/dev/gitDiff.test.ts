import { describe, it, expect, vi, beforeEach } from "vitest";
import { gitDiffTool } from "../../../src/tools/dev/gitDiff.js";

vi.mock("../../../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: "diff", stderr: "", exitCode: 0 }),
}));

describe("gitDiffTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls git diff with optional path and staged", async () => {
    const { runWorkspaceCommand } = await import("../../../src/runtime/commandExecutor.js");
    await gitDiffTool({ path: "src/a.ts", staged: true });
    expect(runWorkspaceCommand).toHaveBeenCalledWith("git diff --staged -- src/a.ts", expect.any(Object));
  });

  it("calls git diff with no args", async () => {
    const { runWorkspaceCommand } = await import("../../../src/runtime/commandExecutor.js");
    await gitDiffTool();
    expect(runWorkspaceCommand).toHaveBeenCalledWith("git diff ", expect.any(Object));
  });
});
