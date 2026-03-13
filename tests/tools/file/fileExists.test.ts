import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileExistsTool } from "../../../src/tools/file/fileExists.js";

vi.mock("../../../src/runtime/workspaceManager.js", () => ({
  workspaceFileExists: vi.fn().mockResolvedValue(true),
  getWorkspaceRoot: vi.fn().mockReturnValue("/ws"),
  listWorkspaceFiles: vi.fn(),
  listWorkspaceDirectEntries: vi.fn(),
  readWorkspaceFile: vi.fn(),
  statWorkspacePath: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  backupFileIfExists: vi.fn(),
  deleteWorkspaceFile: vi.fn(),
  deleteWorkspaceFiles: vi.fn(),
  deleteWorkspaceFolder: vi.fn(),
  moveWorkspaceFile: vi.fn(),
  copyWorkspaceFile: vi.fn(),
}));

describe("fileExistsTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns exists true when file exists", async () => {
    const result = await fileExistsTool("src/main.ts");
    expect(result.path).toBe("src/main.ts");
    expect(result.exists).toBe(true);
  });

  it("returns exists false for protected path without calling workspace", async () => {
    const result = await fileExistsTool("node_modules/foo");
    expect(result.exists).toBe(false);
  });
});
