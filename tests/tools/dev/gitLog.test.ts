import { describe, it, expect, vi, beforeEach } from "vitest";
import { gitLogTool } from "../../../src/tools/dev/gitLog.js";

vi.mock("../../../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: "commit abc", stderr: "", exitCode: 0 }),
}));

describe("gitLogTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls git log with optional maxCount and path", async () => {
    const { runWorkspaceCommand } = await import("../../../src/runtime/commandExecutor.js");
    await gitLogTool({ maxCount: 5, path: "src/" });
    expect(runWorkspaceCommand).toHaveBeenCalledWith("git log -n 5 -- src/", expect.any(Object));
  });
});
