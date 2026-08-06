import { describe, expect, it } from "vitest";

import { advanceCameraFollow } from "../src/client/camera-follow";

describe("camera follow", () => {
  const options = {
    viewportWidth: 900,
    viewportHeight: 500,
    arenaWidth: 2_880,
    arenaHeight: 1_620,
    deadzoneWidth: 220,
    deadzoneHeight: 120,
    smoothing: 10,
  };

  it("holds the camera inside the central deadzone", () => {
    expect(advanceCameraFollow({ x: 1_440, y: 810 }, { x: 1_480, y: 820 }, options, 16)).toEqual({ x: 1_440, y: 810 });
  });

  it("moves smoothly toward a target outside the deadzone", () => {
    const next = advanceCameraFollow({ x: 1_440, y: 810 }, { x: 1_900, y: 1_100 }, options, 16);
    expect(next.x).toBeGreaterThan(1_440);
    expect(next.x).toBeLessThan(1_900);
    expect(next.y).toBeGreaterThan(810);
    expect(next.y).toBeLessThan(1_100);
  });

  it("clamps camera center to the arena bounds", () => {
    expect(advanceCameraFollow({ x: 1_440, y: 810 }, { x: 2_900, y: 1_700 }, options, 2_000)).toEqual({ x: 2_430, y: 1_370 });
  });
});
