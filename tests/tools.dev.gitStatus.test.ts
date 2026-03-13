import { describe, it, expect, vi, beforeEach } from "vitest";
import { gitStatusTool } from "../src/tools/dev/gitStatus.js";

vi.mock("../src/runtime/commandExecutor.js", () => ({
  runWorkspaceCommand: vi.fn().mockResolvedValue({ stdout: " M file.ts", stderr: "", exitCode: 0 }),
}));

describe("gitStatusTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs git status --short", async () => {
    const { runWorkspaceCommand } = await import("../src/runtime/commandExecutor.js");
    const result = await gitStatusTool();
    expect(runWorkspaceCommand).toHaveBeenCalledWith("git status --short");
    expect(result.stdout).toContain("file.ts");
    expect(result.exitCode).toBe(0);
  });
});
