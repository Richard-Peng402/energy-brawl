import { describe, expect, it } from "vitest";

import { PLAYER_SPEED } from "../src/shared/constants";
import { predictLocalPosition } from "../src/client/prediction";

describe("local movement prediction", () => {
  it("applies normalized input immediately using server movement speed", () => {
    const next = predictLocalPosition({ x: 200, y: 200 }, { x: 1, y: 1 }, 100);

    expect(Math.hypot(next.x - 200, next.y - 200)).toBeCloseTo(PLAYER_SPEED * 0.1);
  });

  it("does not predict through solid walls", () => {
    const next = predictLocalPosition({ x: 420, y: 250 }, { x: 1, y: 0 }, 100);

    expect(next.x).toBe(420);
  });
});
