import { describe, expect, it } from "vitest";

import { circleHitsRect, clamp, normalize } from "../src/shared/math";

describe("shared math", () => {
  it("normalizes vectors without producing NaN", () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
  });

  it("clamps values to the requested range", () => {
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it("detects circle and rectangle overlap", () => {
    const rect = { x: 12, y: 8, width: 5, height: 5 };
    expect(circleHitsRect({ x: 10, y: 10 }, 4, rect)).toBe(true);
    expect(circleHitsRect({ x: 0, y: 0 }, 2, rect)).toBe(false);
  });
});
