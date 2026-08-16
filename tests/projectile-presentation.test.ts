import { describe, expect, it } from "vitest";

import { CHARACTER_CATALOG } from "../src/shared/character-catalog";
import {
  getProjectilePresentation,
  selectProjectileTrailPoints,
} from "../src/client/projectile-presentation";

describe("character projectile presentation", () => {
  it("defines a distinct muzzle, core, trail, and impact profile for every character", () => {
    const serialized: string[] = [];
    for (const character of CHARACTER_CATALOG) {
      const profile = getProjectilePresentation(character.id);
      expect(profile.muzzle.textureKey).toBeTruthy();
      expect(profile.core.textureKey).toBeTruthy();
      expect(profile.trail.textureKey).toBeTruthy();
      expect(profile.impacts.wall.textureKey).toBeTruthy();
      expect(profile.impacts.player.textureKey).toBeTruthy();
      expect(profile.impacts.shield.textureKey).toBeTruthy();
      expect(profile.trailSpacingWorld).toBeGreaterThan(0);
      expect(profile.localFireSampleUrl).toContain(`/projectiles/${character.id}/local-fire.ogg`);
      serialized.push(JSON.stringify(profile));
    }
    expect(new Set(serialized).size).toBe(CHARACTER_CATALOG.length);
  });

  it("returns defensive copies and never branches on device class", () => {
    const first = getProjectilePresentation("blaze");
    const second = getProjectilePresentation("blaze");
    first.core.scale = 99;
    expect(second.core.scale).not.toBe(99);
    expect(getProjectilePresentation).toHaveLength(1);
  });

  it("emits evenly spaced trail points in world units regardless of frame timing", () => {
    const profile = getProjectilePresentation("runner");
    const points = selectProjectileTrailPoints(
      { x: 10, y: 20 },
      { x: 10 + profile.trailSpacingWorld * 2.5, y: 20 },
      profile.trailSpacingWorld,
    );

    expect(points).toEqual([
      { x: 10 + profile.trailSpacingWorld, y: 20 },
      { x: 10 + profile.trailSpacingWorld * 2, y: 20 },
    ]);
    expect(selectProjectileTrailPoints({ x: 0, y: 0 }, { x: 12, y: 0 }, 24)).toEqual([]);
  });
});
