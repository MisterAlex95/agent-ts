import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileTool } from "../../../src/tools/file/readFile.js";

vi.mock("../../../src/runtime/workspaceManager.js", () => ({
  readWorkspaceFile: vi.fn().mockResolvedValue("const x = 1;"),
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

describe("readFileTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns content snippet with markers for non-protected path", async () => {
    const result = await readFileTool("src/main.ts");
    expect(result.path).toBe("src/main.ts");
    expect(result.contentSnippet).toContain("(beginning of file)");
    expect(result.contentSnippet).toContain("(end of file)");
    expect(result.contentSnippet).toContain("const x = 1;");
    expect(result.totalChars).toBeGreaterThan(0);
    expect(typeof result.truncated).toBe("boolean");
  });

  it("throws for protected path", async () => {
    await expect(readFileTool(".git/config")).rejects.toThrow("protected path");
  });
});
