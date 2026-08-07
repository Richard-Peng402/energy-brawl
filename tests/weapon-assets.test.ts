import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const weapons = ["cyan-heavy", "violet-rifle", "white-tech", "ember-cannon"] as const;

describe("user-provided weapon skins", () => {
  it("ships four transparent 192px weapon sprites without the source checkerboard", async () => {
    for (const weapon of weapons) {
      const file = path.resolve(`public/assets/v3/weapons/${weapon}.png`);
      const png = await readFile(file);
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(192);
      expect(png.readUInt32BE(20)).toBe(192);
      expect(png[25]).toBe(6);
      expect((await stat(file)).size).toBeGreaterThan(2_000);
      expect((await stat(file)).size).toBeLessThan(100_000);
    }
  });
});
