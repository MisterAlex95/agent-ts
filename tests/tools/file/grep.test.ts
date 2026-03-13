import { describe, it, expect, vi, beforeEach } from "vitest";
import { grepTool } from "../../../src/tools/file/grep.js";

vi.mock("../../../src/runtime/workspaceManager.js", () => ({
  listWorkspaceFiles: vi.fn().mockResolvedValue(["src/a.ts", "src/b.ts"]),
  readWorkspaceFile: vi.fn().mockImplementation((path: string) => {
    if (path === "src/a.ts") return Promise.resolve("hello world\nfoo bar");
    if (path === "src/b.ts") return Promise.resolve("hello again");
    return Promise.reject(new Error("not found"));
  }),
  getWorkspaceRoot: vi.fn().mockReturnValue("/ws"),
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

describe("grepTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns matches for pattern", async () => {
    const result = await grepTool("src", "hello");
    expect(result.pattern).toBe("hello");
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches.some((m) => m.line.includes("hello"))).toBe(true);
  });
});
