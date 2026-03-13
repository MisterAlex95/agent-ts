import { describe, it, expect, vi, beforeEach } from "vitest";
import { runBuildTool } from "../../../src/tools/dev/runBuild.js";

vi.mock("../../../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

describe("runBuildTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs npm run build", async () => {
    const { runWorkspaceCommand } = await import("../../../src/runtime/commandExecutor.js");
    await runBuildTool();
    expect(runWorkspaceCommand).toHaveBeenCalledWith("npm run build", expect.any(Object));
  });
});
