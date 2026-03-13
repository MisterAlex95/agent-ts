import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCodeTool } from "../../../src/tools/search/searchCode.js";

vi.mock("../../../src/rag/search.js", () => ({
  hybridSearch: vi.fn().mockResolvedValue([{ filePath: "a.ts", content: "x", score: 0.9, language: "ts" }]),
}));

describe("searchCodeTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns query and hybrid search results", async () => {
    const { hybridSearch } = await import("../../../src/rag/search.js");
    const result = await searchCodeTool("foo");
    expect(hybridSearch).toHaveBeenCalledWith("foo");
    expect(result.query).toBe("foo");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].filePath).toBe("a.ts");
  });
});
