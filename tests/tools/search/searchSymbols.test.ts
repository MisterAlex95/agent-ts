import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchSymbolsTool } from "../../../src/tools/search/searchSymbols.js";

vi.mock("../../../src/rag/search.js", () => ({
  semanticSearchSymbols: vi.fn().mockResolvedValue([{ filePath: "b.ts", symbol: "Bar", kind: "class", score: 0.8, language: "ts", content: "" }]),
}));

describe("searchSymbolsTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns query and symbol search results", async () => {
    const { semanticSearchSymbols } = await import("../../../src/rag/search.js");
    const result = await searchSymbolsTool("Bar");
    expect(semanticSearchSymbols).toHaveBeenCalledWith("Bar");
    expect(result.query).toBe("Bar");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].symbol).toBe("Bar");
  });
});
