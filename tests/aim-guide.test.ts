import { describe, expect, it } from "vitest";

import { calculateAimGuide } from "../src/client/aim-guide";

describe("aim guide", () => {
  it("reaches maximum range without a wall", () => {
    const guide = calculateAimGuide({ x: 100, y: 100 }, { x: 1, y: 0 }, 500, []);
    expect(guide).toMatchObject({ end: { x: 600, y: 100 }, length: 500, visible: true });
  });

  it("stops at the first wall on its center line", () => {
    const guide = calculateAimGuide({ x: 100, y: 100 }, { x: 1, y: 0 }, 500, [
      { x: 300, y: 50, width: 40, height: 100 },
    ]);
    expect(guide.end.x).toBeCloseTo(300);
    expect(guide.length).toBeCloseTo(200);
  });

  it("ignores a wall behind the player", () => {
    const guide = calculateAimGuide({ x: 100, y: 100 }, { x: 1, y: 0 }, 500, [
      { x: 20, y: 50, width: 40, height: 100 },
    ]);
    expect(guide.length).toBe(500);
  });

  it("hides stable zero and dead-zone aim", () => {
    expect(calculateAimGuide({ x: 100, y: 100 }, { x: 0, y: 0 }, 500, []).visible).toBe(false);
    expect(calculateAimGuide({ x: 100, y: 100 }, { x: 0.1, y: 0 }, 500, []).visible).toBe(false);
  });
});
