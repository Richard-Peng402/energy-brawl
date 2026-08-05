import { describe, expect, it } from "vitest";

import {
  APPROVED_ASSET_SOURCES,
  ARENA_ASSETS,
  ASSET_MANIFEST,
  CHARACTER_ASSETS,
  INITIAL_LOBBY_COMPRESSED_BYTES,
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
    }

    expect(Object.keys(ARENA_ASSETS)).toEqual(["floor", "wall", "decal", "light"]);
    expect(Object.keys(SKILL_ICON_ASSETS)).toEqual(["dash", "shield", "spread", "heal"]);
    for (const path of [...Object.values(ARENA_ASSETS), ...Object.values(SKILL_ICON_ASSETS)]) {
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
  });

  it("rejects assets with unknown provenance", () => {
    expect(validateAssetManifest([{ ...ASSET_MANIFEST[0]!, sourceUrl: "https://unknown.example/art" }]))
      .toContain("Unknown asset source: https://unknown.example/art");
  });

  it("keeps the compressed initial lobby asset budget below 8 MiB", () => {
    expect(INITIAL_LOBBY_COMPRESSED_BYTES).toBeGreaterThan(0);
    expect(INITIAL_LOBBY_COMPRESSED_BYTES).toBeLessThan(8 * 1024 * 1024);
  });
});
