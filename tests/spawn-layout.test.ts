import { describe, expect, it } from "vitest";

import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ENERGY_RADIUS,
  ENERGY_SPAWN_POINTS,
  PLAYER_RADIUS,
  SPAWN_POINTS,
  WALLS,
} from "../src/shared/constants";
import { circleHitsRect, distanceSquared } from "../src/shared/math";

describe("mobile spawn layout", () => {
  it("keeps all spawn centers outside the mobile HUD and stick zones", () => {
    const viewport = { width: 844, height: 390 };
    const blocked = [
      { left: 8, right: 196, top: 38, bottom: 122 },
      { left: 638, right: 836, top: 38, bottom: 167 },
      { left: 373, right: 471, top: 36, bottom: 105 },
      { left: 14, right: 150, top: 252, bottom: 388 },
      { left: 694, right: 830, top: 252, bottom: 388 },
    ];

    for (const spawn of SPAWN_POINTS) {
      const projected = {
        x: (spawn.x / ARENA_WIDTH) * viewport.width,
        y: (spawn.y / ARENA_HEIGHT) * viewport.height,
      };
      expect(
        blocked.some(
          (area) =>
            projected.x >= area.left &&
            projected.x <= area.right &&
            projected.y >= area.top &&
            projected.y <= area.bottom,
        ),
        `spawn ${spawn.x},${spawn.y} projects under mobile controls`,
      ).toBe(false);
    }
  });

  it("keeps every energy spawn outside solid walls", () => {
    for (const spawn of ENERGY_SPAWN_POINTS) {
      expect(
        WALLS.some((wall) => circleHitsRect(spawn, ENERGY_RADIUS, wall)),
        `energy ${spawn.x},${spawn.y} overlaps a wall`,
      ).toBe(false);
    }
  });

  it("keeps players clear of walls and starting energy", () => {
    const collectionDistance = PLAYER_RADIUS + ENERGY_RADIUS;
    for (const spawn of SPAWN_POINTS) {
      expect(WALLS.some((wall) => circleHitsRect(spawn, PLAYER_RADIUS, wall))).toBe(false);
      expect(
        ENERGY_SPAWN_POINTS.some(
          (energy) => distanceSquared(spawn, energy) <= collectionDistance * collectionDistance,
        ),
        `spawn ${spawn.x},${spawn.y} starts on collectible energy`,
      ).toBe(false);
    }
  });
});
