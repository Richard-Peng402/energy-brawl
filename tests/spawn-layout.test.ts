import { describe, expect, it } from "vitest";

import {
  ARENA_SCALE,
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
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  SPAWN_POINTS,
  TARGET_SCORE,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WALLS,
} from "../src/shared/constants";
import { circleHitsRect, distanceSquared } from "../src/shared/math";

const V2_SPAWN_POINTS = [
  { x: 260, y: 260 },
  { x: 1080, y: 210 },
  { x: 1900, y: 260 },
  { x: 260, y: 955 },
  { x: 1080, y: 1005 },
  { x: 1900, y: 955 },
] as const;

const V2_ENERGY_SPAWN_POINTS = [
  { x: 1080, y: 350 },
  { x: 1080, y: 865 },
  { x: 520, y: 607 },
  { x: 1640, y: 607 },
  { x: 760, y: 300 },
  { x: 1400, y: 915 },
  { x: 760, y: 915 },
  { x: 1400, y: 300 },
  { x: 300, y: 607 },
  { x: 1860, y: 607 },
] as const;

const V2_WALLS = [
  { x: 930, y: 475, width: 300, height: 55 },
  { x: 930, y: 685, width: 300, height: 55 },
  { x: 790, y: 535, width: 55, height: 145 },
  { x: 1315, y: 535, width: 55, height: 145 },
  { x: 390, y: 330, width: 260, height: 55 },
  { x: 390, y: 330, width: 55, height: 190 },
  { x: 1510, y: 330, width: 260, height: 55 },
  { x: 1715, y: 330, width: 55, height: 190 },
  { x: 390, y: 830, width: 260, height: 55 },
  { x: 390, y: 695, width: 55, height: 190 },
  { x: 1510, y: 830, width: 260, height: 55 },
  { x: 1715, y: 695, width: 55, height: 190 },
  { x: 720, y: 155, width: 180, height: 45 },
  { x: 1260, y: 1015, width: 180, height: 45 },
] as const;

describe("v3 arena layout", () => {
  it("locks the v3 arena, camera, and unchanged combat pacing contract", () => {
    expect(ARENA_SCALE).toBe(4 / 3);
    expect(ARENA_WIDTH).toBe(2_880);
    expect(ARENA_HEIGHT).toBe(1_620);
    expect(VIEW_WIDTH).toBe(1_536);
    expect(VIEW_HEIGHT).toBe(864);
    expect(MATCH_DURATION_MS).toBe(480_000);
    expect(TARGET_SCORE).toBe(20);
    expect(HOLD_DURATION_MS).toBe(30_000);
    expect(KILL_SCORE).toBe(2);
    expect(HOLDER_KILL_BONUS).toBe(1);
    expect(MAX_ENERGY).toBe(6);
    expect(ENERGY_RESPAWN_MS).toBe(5_000);
    expect(PLAYER_RADIUS).toBe(27);
    expect(PLAYER_SPEED).toBe(265);
    expect(FIRE_COOLDOWN_MS).toBe(450);
    expect(PROJECTILE_RADIUS).toBe(8);
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

  it("scales every approved v2 spawn and wall dimension by exactly four thirds", () => {
    expect(SPAWN_POINTS).toEqual(
      V2_SPAWN_POINTS.map(({ x, y }) => ({ x: x * ARENA_SCALE, y: y * ARENA_SCALE })),
    );
    expect(ENERGY_SPAWN_POINTS).toEqual(
      V2_ENERGY_SPAWN_POINTS.map(({ x, y }) => ({ x: x * ARENA_SCALE, y: y * ARENA_SCALE })),
    );
    expect(WALLS).toEqual(
      V2_WALLS.map(({ x, y, width, height }) => ({
        x: x * ARENA_SCALE,
        y: y * ARENA_SCALE,
        width: width * ARENA_SCALE,
        height: height * ARENA_SCALE,
      })),
    );
    expect(SPAWN_POINTS).toHaveLength(V2_SPAWN_POINTS.length);
    expect(ENERGY_SPAWN_POINTS).toHaveLength(V2_ENERGY_SPAWN_POINTS.length);
    expect(WALLS).toHaveLength(14);
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
