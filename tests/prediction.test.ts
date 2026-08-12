import { describe, expect, it } from "vitest";

import { ARENA_SCALE, PLAYER_RADIUS, PLAYER_SPEED } from "../src/shared/constants";
import { predictLocalPosition } from "../src/client/prediction";
import { MAP_CATALOG } from "../src/shared/map-catalog";

describe("local movement prediction", () => {
  it("applies normalized input immediately using server movement speed", () => {
    const next = predictLocalPosition({ x: 200, y: 200 }, { x: 1, y: 1 }, 100);

    expect(Math.hypot(next.x - 200, next.y - 200)).toBeCloseTo(PLAYER_SPEED * 0.1);
  });

  it("does not predict through solid walls", () => {
    const startX = 900 * ARENA_SCALE;
    const next = predictLocalPosition(
      { x: startX, y: 500 * ARENA_SCALE },
      { x: 1, y: 0 },
      100,
    );

    expect(next.x).toBeLessThanOrEqual(930 * ARENA_SCALE - PLAYER_RADIUS);
    expect(next.x).toBeGreaterThan(startX);
  });

  it("uses the full movement delta just like the authoritative simulation", () => {
    const next = predictLocalPosition({ x: 200, y: 200 }, { x: 1, y: 0 }, 200);

    expect(next.x - 200).toBeCloseTo(PLAYER_SPEED * 0.2);
  });

  it("uses the selected character's dynamic movement speed", () => {
    const next = predictLocalPosition({ x: 200, y: 200 }, { x: 1, y: 0 }, 100, 282);

    expect(next.x - 200).toBeCloseTo(28.2);
  });

  it.each(MAP_CATALOG)("uses $name walls for local prediction", (map) => {
    const wall = map.id === "crystal-ruins" ? map.walls[4]! : map.walls[0]!;
    const start = {
      x: wall.x - PLAYER_RADIUS - 20,
      y: wall.y + wall.height / 2,
    };

    const next = predictLocalPosition(start, { x: 1, y: 0 }, 300, PLAYER_SPEED, map.id);

    expect(next.x).toBeLessThanOrEqual(wall.x - PLAYER_RADIUS);
    expect(next.y).toBeCloseTo(start.y);
  });
});
