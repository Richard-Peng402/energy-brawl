import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("v4 skill effect assets", () => {
  it("packages one licensed vector effect for every character", () => {
    const manifest = JSON.parse(readFileSync(new URL("../public/assets/v4/manifest.json", import.meta.url), "utf8")) as { entries: Array<{ license: string; outputFiles: string[] }> };
    expect(manifest.entries).toHaveLength(6);
    for (const entry of manifest.entries) {
      expect(entry.license).toBeTruthy();
      for (const output of entry.outputFiles) expect(existsSync(new URL(`../public${output}`, import.meta.url))).toBe(true);
    }
  });
});
