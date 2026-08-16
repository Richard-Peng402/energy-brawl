import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EXCLUSIVE_SKILL_IDS } from "../src/shared/exclusive-skill-catalog";
import { CHARACTER_CATALOG } from "../src/shared/character-catalog";
import { MAP_CATALOG } from "../src/shared/map-catalog";
import { EXCLUSIVE_SKILL_STAGE_ASSETS } from "../src/client/asset-registry";

interface AssetEntry {
  author: string;
  license: string;
  sourceUrl: string;
  modifications: string;
  outputFiles: string[];
}

const manifestPath = path.resolve("public/assets/v4/manifest.json");

describe("v4 presentation asset pack", () => {
  it("contains every exclusive skill, projectile, and map ambience output", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { entries: AssetEntry[] };
    const outputs = new Set(manifest.entries.flatMap((entry) => entry.outputFiles));
    for (const skillId of EXCLUSIVE_SKILL_IDS) {
      for (const stage of ["cast", "active", "end"] as const) {
        expect(outputs).toContain(`/assets/v4/fx/exclusive-skills/${skillId}/${stage}.svg`);
        expect(outputs).toContain(`/assets/v4/audio/exclusive-skills/${skillId}/${stage}.ogg`);
        expect(EXCLUSIVE_SKILL_STAGE_ASSETS[skillId][stage]).toBe(`/assets/v4/fx/exclusive-skills/${skillId}/${stage}.svg`);
      }
    }
    for (const character of CHARACTER_CATALOG) {
      for (const kind of ["muzzle", "core", "trail", "wall-impact", "player-impact", "shield-impact"] as const) {
        expect(outputs).toContain(`/assets/v4/fx/projectiles/${character.id}/${kind}.png`);
      }
      for (const kind of ["local-fire", "impact"] as const) {
        expect(outputs).toContain(`/assets/v4/audio/projectiles/${character.id}/${kind}.ogg`);
      }
    }
    for (const map of MAP_CATALOG) expect(outputs).toContain(`/assets/v4/audio/maps/${map.id}/ambience.ogg`);
  });

  it("records complete redistribution metadata and non-empty local files", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { entries: AssetEntry[] };
    for (const entry of manifest.entries) {
      expect(entry.author.trim()).not.toBe("");
      expect(entry.license.trim()).not.toBe("");
      expect(entry.sourceUrl).toMatch(/^(https:\/\/|local:\/\/)/);
      expect(entry.modifications.trim()).not.toBe("");
      for (const output of entry.outputFiles) {
        const info = await stat(path.resolve(`public${output}`));
        expect(info.isFile()).toBe(true);
        expect(info.size).toBeGreaterThan(0);
      }
    }
  });
});
