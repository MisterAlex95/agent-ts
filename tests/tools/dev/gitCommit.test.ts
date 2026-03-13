import { describe, it, expect, vi, beforeEach } from "vitest";
import { gitCommitTool } from "../../../src/tools/dev/gitCommit.js";

vi.mock("../../../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

describe("gitCommitTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("escapes message and runs git commit", async () => {
    const { runWorkspaceCommand } = await import("../../../src/runtime/commandExecutor.js");
    await gitCommitTool('fix: "quoted"');
    expect(runWorkspaceCommand).toHaveBeenCalledWith('git commit -m "fix: \\"quoted\\""', expect.any(Object));
  });
});
