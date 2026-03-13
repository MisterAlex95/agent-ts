import { describe, it, expect, vi, beforeEach } from "vitest";
import { wcTool } from "../src/tools/file/wc.js";

vi.mock("../src/runtime/workspaceManager.js", () => ({
  readWorkspaceFile: vi.fn().mockResolvedValue("one two three\nfour five"),
  getWorkspaceRoot: vi.fn().mockReturnValue("/ws"),
  listWorkspaceFiles: vi.fn(),
  listWorkspaceDirectEntries: vi.fn(),
  statWorkspacePath: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  backupFileIfExists: vi.fn(),
  deleteWorkspaceFile: vi.fn(),
  deleteWorkspaceFiles: vi.fn(),
  deleteWorkspaceFolder: vi.fn(),
  moveWorkspaceFile: vi.fn(),
  copyWorkspaceFile: vi.fn(),
  workspaceFileExists: vi.fn(),
}));

describe("wcTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns lines, words, bytes", async () => {
    const result = await wcTool("src/main.ts");
    expect(result.path).toBe("src/main.ts");
    expect(result.lines).toBe(2);
    expect(result.words).toBe(5);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("throws for protected path", async () => {
    await expect(wcTool(".git/config")).rejects.toThrow("protected");
  });
});
