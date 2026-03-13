import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCommandTool } from "../src/tools/command/index.js";

vi.mock("../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 }),
}));

describe("runCommandTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to runWorkspaceCommand", async () => {
    const { runWorkspaceCommand } = await import("../src/runtime/commandExecutor.js");
    const result = await runCommandTool("echo hello");
    expect(runWorkspaceCommand).toHaveBeenCalledWith("echo hello", undefined);
    expect(result.stdout).toBe("ok");
  });
});
