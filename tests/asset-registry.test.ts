import { describe, expect, it } from "vitest";

import {
  APPROVED_ASSET_SOURCES,
  ARENA_ASSETS,
  ASSET_MANIFEST,
  CHARACTER_ASSETS,
  CHARACTER_DIRECTION_ASSETS,
  CHARACTER_DIRECTIONS,
  EXCLUSIVE_SKILL_STAGE_ASSETS,
  INITIAL_LOBBY_COMPRESSED_BYTES,
  MAP_AMBIENCE_ASSETS,
  PICKUP_ASSETS,
  PROJECTILE_FX_ASSETS,
  WEAPON_ASSETS,
  SKILL_ICON_ASSETS,
  validateAssetManifest,
} from "../src/client/asset-registry";

const characterIds = ["blaze", "medic", "fortress", "arc", "phase", "runner"] as const;
const characterFiles = ["portrait", "idle", "move", "attack", "hit", "death", "fallback"] as const;

describe("v3 asset registry", () => {
  it("provides every runtime character, arena, and skill asset under /assets/v3", () => {
    expect(Object.keys(CHARACTER_ASSETS)).toEqual(characterIds);
    for (const characterId of characterIds) {
      const assets = CHARACTER_ASSETS[characterId];
      for (const file of characterFiles) expect(assets[file]).toMatch(/^\/assets\/v3\//);
      expect(assets.portrait).not.toBe(assets.idle);
      expect(assets.idle).toMatch(/\/combat\.png$/);
      expect(assets.move).toBe(assets.idle);
      expect(assets.attack).toBe(assets.idle);
      expect(Object.keys(CHARACTER_DIRECTION_ASSETS[characterId])).toEqual(CHARACTER_DIRECTIONS);
      for (const direction of CHARACTER_DIRECTIONS) {
        expect(CHARACTER_DIRECTION_ASSETS[characterId][direction]).toBe(
          `/assets/v3/characters/${characterId}/directions/${direction}.png`,
        );
      }
    }

    expect(Object.keys(ARENA_ASSETS)).toEqual(["floor", "wall", "decal", "light", "sigil"]);
    expect(PICKUP_ASSETS.energyCore).toBe("/assets/v3/pickups/energy-core.svg");
    expect(Object.keys(SKILL_ICON_ASSETS)).toEqual(["dash", "shield", "spread", "heal"]);
    expect(Object.keys(PROJECTILE_FX_ASSETS)).toEqual(["core", "trace", "muzzle", "impact", "spark", "smoke"]);
    expect(Object.keys(WEAPON_ASSETS)).toEqual(["cyan-heavy", "violet-rifle", "white-tech", "ember-cannon"]);
    for (const weapon of Object.values(WEAPON_ASSETS)) expect(weapon).toMatch(/^\/assets\/v3\/weapons\/.+\.png$/);
    for (const path of [...Object.values(ARENA_ASSETS), ...Object.values(PICKUP_ASSETS), ...Object.values(SKILL_ICON_ASSETS), ...Object.values(PROJECTILE_FX_ASSETS)]) {
      expect(path).toMatch(/^\/assets\/v3\//);
    }
  });

  it("records complete, approved provenance for every imported output", () => {
    expect(ASSET_MANIFEST.length).toBeGreaterThan(0);
    expect(validateAssetManifest(ASSET_MANIFEST)).toEqual([]);
    for (const entry of ASSET_MANIFEST) {
      expect(entry).toEqual(expect.objectContaining({
        source: expect.any(String),
        author: expect.any(String),
        license: expect.any(String),
        sourceUrl: expect.any(String),
        outputFiles: expect.any(Array),
      }));
      expect(APPROVED_ASSET_SOURCES).toContain(entry.sourceUrl);
      expect(entry.outputFiles.length).toBeGreaterThan(0);
    }
    expect(ASSET_MANIFEST.flatMap((entry) => entry.outputFiles).filter((path) => path.endsWith("/combat.png"))).toHaveLength(6);
    expect(ASSET_MANIFEST.flatMap((entry) => entry.outputFiles).filter((path) => path.includes("/directions/"))).toHaveLength(48);
    expect(ASSET_MANIFEST.flatMap((entry) => entry.outputFiles).filter((path) => path.includes("/weapons/"))).toHaveLength(4);
    expect(ASSET_MANIFEST.some((entry) => entry.source === "Particle Pack" && entry.license === "CC0 1.0")).toBe(true);
    expect(ASSET_MANIFEST.some((entry) => entry.source === "Sci-Fi RTS" && entry.license === "CC0 1.0")).toBe(true);
    expect(ASSET_MANIFEST.some((entry) => entry.source === "Top-down Sci-fi Shooter Terrain Texture" && entry.license === "CC-BY-SA 3.0")).toBe(true);
    expect(ASSET_MANIFEST.some((entry) => entry.source === "User-provided character art")).toBe(true);
    expect(ASSET_MANIFEST.some((entry) => entry.source === "User-provided weapon art" && entry.sourceUrl === "local://user-provided-weapon-art")).toBe(true);
  });

  it("rejects assets with unknown provenance", () => {
    expect(validateAssetManifest([{ ...ASSET_MANIFEST[0]!, sourceUrl: "https://unknown.example/art" }]))
      .toContain("Unknown asset source: https://unknown.example/art");
  });

  it("keeps the compressed initial lobby asset budget below 8 MiB", () => {
    expect(INITIAL_LOBBY_COMPRESSED_BYTES).toBeGreaterThan(0);
    expect(INITIAL_LOBBY_COMPRESSED_BYTES).toBeLessThan(8 * 1024 * 1024);
  });

  it("registers cast, active, and end fallbacks for every exclusive skill", () => {
    expect(Object.keys(EXCLUSIVE_SKILL_STAGE_ASSETS)).toHaveLength(6);
    for (const stages of Object.values(EXCLUSIVE_SKILL_STAGE_ASSETS)) {
      expect(Object.keys(stages).sort()).toEqual(["active", "cast", "end"]);
      for (const path of Object.values(stages)) expect(path).toMatch(/^\/assets\/v4\/fx\/exclusive-skills\/.+\/(cast|active|end)\.svg$/);
    }
  });

  it("registers one packaged ambience asset for every map", () => {
    expect(MAP_AMBIENCE_ASSETS).toEqual({
      "reactor-core": "/assets/v4/audio/maps/reactor-core/ambience.ogg",
      "neon-docks": "/assets/v4/audio/maps/neon-docks/ambience.ogg",
      "crystal-ruins": "/assets/v4/audio/maps/crystal-ruins/ambience.ogg",
    });
  });
});
