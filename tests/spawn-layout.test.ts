import { describe, expect, it } from "vitest";

import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ENERGY_RESPAWN_MS,
  ENERGY_RADIUS,
  ENERGY_SPAWN_POINTS,
  FIRE_COOLDOWN_MS,
  HOLD_DURATION_MS,
  HOLDER_KILL_BONUS,
  KILL_SCORE,
  MATCH_DURATION_MS,
  MAX_ENERGY,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PROJECTILE_SPEED,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  SPAWN_POINTS,
  TARGET_SCORE,
  WALLS,
} from "../src/shared/constants";
import { circleHitsRect, distanceSquared } from "../src/shared/math";

describe("mobile spawn layout", () => {
  it("locks the v2 pacing and arena contract", () => {
    expect(ARENA_WIDTH).toBe(2_160);
    expect(ARENA_HEIGHT).toBe(1_215);
    expect(MATCH_DURATION_MS).toBe(480_000);
    expect(TARGET_SCORE).toBe(15);
    expect(HOLD_DURATION_MS).toBe(30_000);
    expect(KILL_SCORE).toBe(2);
    expect(HOLDER_KILL_BONUS).toBe(1);
    expect(MAX_ENERGY).toBe(6);
    expect(ENERGY_RESPAWN_MS).toBe(5_000);
    expect(PLAYER_SPEED).toBe(265);
    expect(FIRE_COOLDOWN_MS).toBe(450);
    expect(PROJECTILE_SPEED).toBe(620);
    expect(SERVER_TICK_RATE).toBe(60);
    expect(SNAPSHOT_RATE).toBe(30);
    expect(SPAWN_POINTS).toHaveLength(6);
  });

  it("keeps spawn centers pairwise separated", () => {
    for (let i = 0; i < SPAWN_POINTS.length; i += 1) {
      for (let j = i + 1; j < SPAWN_POINTS.length; j += 1) {
        expect(
          distanceSquared(SPAWN_POINTS[i]!, SPAWN_POINTS[j]!),
          `spawns ${i} and ${j} are too close`,
        ).toBeGreaterThanOrEqual(360 * 360);
      }
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
