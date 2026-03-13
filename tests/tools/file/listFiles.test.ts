import { describe, it, expect } from "vitest";
import { listFilesTool } from "../../../src/tools/file/listFiles.js";

describe("listFilesTool", () => {
  it("lists files in the workspace root", async () => {
    const result = await listFilesTool(".");
    expect(result.root).toContain("workspace");
    expect(Array.isArray(result.files)).toBe(true);
    expect(Array.isArray(result.entries)).toBe(true);
  });
});
