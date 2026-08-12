import { describe, expect, it } from "vitest";

import { MAP_ARENA_ASSETS } from "../src/client/asset-registry";
import { MAP_VISUAL_PROFILES } from "../src/client/map-visuals";
import { MAP_CATALOG } from "../src/shared/map-catalog";

describe("map visual profiles", () => {
  it("provides a complete, map-specific asset bundle for every map", () => {
    expect(Object.keys(MAP_ARENA_ASSETS)).toEqual(MAP_CATALOG.map((map) => map.id));

    for (const map of MAP_CATALOG) {
      const assets = MAP_ARENA_ASSETS[map.id];
      expect(Object.keys(assets)).toEqual(["floor", "wall", "decal", "light", "props"]);
      for (const asset of [assets.floor, assets.wall, assets.decal, assets.light, ...assets.props]) {
        expect(asset).toMatch(new RegExp(`^/assets/v3/arena/maps/${map.id}/`));
      }
      expect(assets.props.length).toBeGreaterThanOrEqual(3);
    }

    expect(new Set(MAP_CATALOG.map((map) => MAP_ARENA_ASSETS[map.id].floor)).size).toBe(MAP_CATALOG.length);
    expect(new Set(MAP_CATALOG.map((map) => MAP_ARENA_ASSETS[map.id].wall)).size).toBe(MAP_CATALOG.length);
  });

  it("keeps rendering style and decoration placement outside combat geometry", () => {
    expect(Object.keys(MAP_VISUAL_PROFILES)).toEqual(MAP_CATALOG.map((map) => map.id));

    for (const map of MAP_CATALOG) {
      const profile = MAP_VISUAL_PROFILES[map.id];
      expect(profile.decorations.length).toBeGreaterThanOrEqual(8);
      expect(profile.floorTint).toBeGreaterThan(0);
      expect(profile.wallTint).toBeGreaterThan(0);
      expect(profile.accentColor).not.toBe(profile.primaryColor);
      expect(profile.floorAlpha).toBeGreaterThanOrEqual(0.72);
    }
  });
});
