import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const characterIds = ["blaze", "medic", "fortress", "arc", "phase", "runner"] as const;
const directions = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"] as const;

describe("user-provided eight-direction character sprites", () => {
  it("ships 48 normalized transparent 192px PNG frames", async () => {
    for (const characterId of characterIds) {
      for (const direction of directions) {
        const file = path.resolve(`public/assets/v3/characters/${characterId}/directions/${direction}.png`);
        const png = await readFile(file);
        expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
        expect(png.readUInt32BE(16)).toBe(192);
        expect(png.readUInt32BE(20)).toBe(192);
        expect(png[25]).toBe(6);
        expect((await stat(file)).size).toBeGreaterThan(2_000);
        expect((await stat(file)).size).toBeLessThan(180_000);
      }
    }
  });

  it("keeps the complete directional character payload within the mobile preload budget", async () => {
    const sizes = await Promise.all(characterIds.flatMap((characterId) => directions.map(async (direction) =>
      (await stat(path.resolve(`public/assets/v3/characters/${characterId}/directions/${direction}.png`))).size,
    )));
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(5 * 1024 * 1024);
  });
});
