import { describe, expect, it } from "vitest";

import { firstWallHit, moveCircleSafely, sweepCircleRect } from "../src/shared/collision";
import { circleHitsRect } from "../src/shared/math";
import type { Rect } from "../src/shared/protocol";

describe("continuous collision primitives", () => {
  it("finds a thin wall crossed between projectile frames", () => {
    const hit = sweepCircleRect(
      { x: 0, y: 50 },
      { x: 200, y: 0 },
      8,
      { x: 90, y: 0, width: 10, height: 100 },
    );

    expect(hit?.time).toBeCloseTo(0.41);
    expect(hit?.normal).toEqual({ x: -1, y: 0 });
  });

  it("depenetrates a player and still lets it move away", () => {
    const result = moveCircleSafely(
      { x: 95, y: 50 },
      { x: -20, y: 0 },
      12,
      [{ x: 90, y: 0, width: 20, height: 100 }],
      { width: 300, height: 200 },
    );

    expect(result.x).toBeLessThanOrEqual(78);
  });

  it("slides along a wall when diagonal movement is blocked", () => {
    const result = moveCircleSafely(
      { x: 70, y: 30 },
      { x: 30, y: 25 },
      10,
      [{ x: 90, y: 0, width: 20, height: 100 }],
      { width: 300, height: 200 },
    );

    expect(result.x).toBeLessThanOrEqual(80);
    expect(result.y).toBeGreaterThan(30);
  });

  it("returns no hit for zero delta outside a wall", () => {
    expect(sweepCircleRect({ x: 0, y: 0 }, { x: 0, y: 0 }, 5, { x: 20, y: 20, width: 10, height: 10 })).toBeNull();
  });

  it("reports an outside start that enters the expanded wall", () => {
    const hit = sweepCircleRect(
      { x: 0, y: 25 },
      { x: 20, y: 0 },
      5,
      { x: 10, y: 0, width: 10, height: 50 },
    );

    expect(hit?.time).toBeCloseTo(0.25);
    expect(hit?.normal).toEqual({ x: -1, y: 0 });
  });

  it("chooses the nearest wall hit", () => {
    const near: Rect = { x: 40, y: 0, width: 10, height: 100 };
    const far: Rect = { x: 90, y: 0, width: 10, height: 100 };
    const hit = firstWallHit({ x: 0, y: 50 }, { x: 120, y: 0 }, 5, [far, near]);

    expect(hit?.wall).toBe(near);
    expect(hit?.time).toBeCloseTo(35 / 120);
  });

  it("clamps movement to arena bounds", () => {
    expect(moveCircleSafely({ x: 5, y: 195 }, { x: -30, y: 30 }, 10, [], { width: 300, height: 200 })).toEqual({ x: 10, y: 190 });
  });

  it("keeps depenetration clear of a wall at the arena boundary", () => {
    const wall = { x: 0, y: 0, width: 100, height: 100 };
    const result = moveCircleSafely({ x: 5, y: 50 }, { x: 0, y: 0 }, 10, [wall], { width: 300, height: 200 });

    expect(result.x).toBeGreaterThanOrEqual(10);
    expect(result.x).toBeLessThanOrEqual(290);
    expect(result.y).toBeGreaterThanOrEqual(10);
    expect(result.y).toBeLessThanOrEqual(190);
    expect(circleHitsRect(result, 10, wall)).toBe(false);
  });
});
