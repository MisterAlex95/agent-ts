import { describe, it, expect, vi, beforeEach } from "vitest";
import { runNpmTool } from "../../../src/tools/dev/runNpm.js";

vi.mock("../../../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

describe("runNpmTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs npm with given args", async () => {
    const { runWorkspaceCommand } = await import("../../../src/runtime/commandExecutor.js");
    await runNpmTool("run build");
    expect(runWorkspaceCommand).toHaveBeenCalledWith("npm run build", expect.any(Object));
  });

  it("passes cwd when provided", async () => {
    const { runWorkspaceCommand } = await import("../../../src/runtime/commandExecutor.js");
    await runNpmTool("test -- --run", { cwd: "react-ts" });
    expect(runWorkspaceCommand).toHaveBeenCalledWith(
      "npm test -- --run",
      expect.objectContaining({ cwd: "react-ts" }),
    );
  });

  it("returns skipped when args is empty", async () => {
    const result = await runNpmTool("");
    expect(result.skipped).toBe(true);
    expect(result.stderr).toContain("runNpm requires args");
  });
});
