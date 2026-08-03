import { describe, expect, it } from "vitest";

import { normalizeStickVector } from "../src/client/virtual-stick";

describe("virtual stick math", () => {
  it("keeps values inside the unit circle", () => {
    expect(normalizeStickVector(30, 40, 100)).toMatchObject({ x: 0.3, y: 0.4, magnitude: 0.5 });
    const clamped = normalizeStickVector(300, 400, 100);
    expect(clamped.x).toBeCloseTo(0.6);
    expect(clamped.y).toBeCloseTo(0.8);
    expect(clamped.magnitude).toBe(1);
  });

  it("returns a stable zero vector", () => {
    expect(normalizeStickVector(0, 0, 0)).toEqual({ x: 0, y: 0, magnitude: 0 });
  });
});
