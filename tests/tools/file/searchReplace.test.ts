import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchReplaceTool } from "../../../src/tools/file/searchReplace.js";

vi.mock("../../../src/runtime/workspaceManager.js", () => ({
  readWorkspaceFile: vi.fn().mockResolvedValue("old snippet here"),
  writeWorkspaceFile: vi.fn().mockResolvedValue(undefined),
  backupFileIfExists: vi.fn().mockResolvedValue(undefined),
  getWorkspaceRoot: vi.fn().mockReturnValue("/ws"),
  listWorkspaceFiles: vi.fn(),
  listWorkspaceDirectEntries: vi.fn(),
  statWorkspacePath: vi.fn(),
  deleteWorkspaceFile: vi.fn(),
  deleteWorkspaceFiles: vi.fn(),
  deleteWorkspaceFolder: vi.fn(),
  moveWorkspaceFile: vi.fn(),
  copyWorkspaceFile: vi.fn(),
  workspaceFileExists: vi.fn(),
}));

describe("searchReplaceTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replaces first occurrence and returns replaced true", async () => {
    const result = await searchReplaceTool("f.ts", "old snippet", "new snippet");
    expect(result.path).toBe("f.ts");
    expect(result.replaced).toBe(true);
    expect(result.message).toContain("Replaced");
  });

  it("returns replaced false when oldText not found", async () => {
    const result = await searchReplaceTool("f.ts", "missing", "x");
    expect(result.replaced).toBe(false);
    expect(result.message).toContain("not found");
  });
});
