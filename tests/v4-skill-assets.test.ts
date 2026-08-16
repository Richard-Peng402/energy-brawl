import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARACTER_CATALOG } from "../src/shared/character-catalog";

describe("v4 skill effect assets", () => {
  it("packages one licensed vector effect for every character", () => {
    const manifest = JSON.parse(readFileSync(new URL("../public/assets/v4/manifest.json", import.meta.url), "utf8")) as { entries: Array<{ license: string; outputFiles: string[] }> };
    const outputs = manifest.entries.flatMap((entry) => entry.outputFiles);
    expect(CHARACTER_CATALOG.map((character) => `/assets/v4/fx/skills/${character.id}.svg`).every((output) => outputs.includes(output))).toBe(true);
    for (const entry of manifest.entries) {
      expect(entry.license).toBeTruthy();
      for (const output of entry.outputFiles) expect(existsSync(new URL(`../public${output}`, import.meta.url))).toBe(true);
    }
  });
});
