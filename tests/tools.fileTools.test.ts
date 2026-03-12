import { listFilesTool } from "../src/tools/fileTools.js";

describe("fileTools", () => {
  it("lists files in the workspace root", async () => {
    const result = await listFilesTool(".");

    expect(result.root).toContain("workspace");
    expect(Array.isArray(result.files)).toBe(true);
  });
});

