import { describe, expect, it } from "vitest";

import { StaticSpatialIndex } from "../src/shared/spatial-index";
import type { Rect } from "../src/shared/protocol";

describe("static spatial index", () => {
  it("returns every wall crossing a query rectangle without duplicates", () => {
    const first: Rect = { x: 0, y: 0, width: 500, height: 20 };
    const second: Rect = { x: 220, y: 100, width: 20, height: 500 };
    const third: Rect = { x: 800, y: 800, width: 20, height: 20 };
    const index = new StaticSpatialIndex([first, second, third], 240);

    const results = index.query({ x: 100, y: 0, width: 300, height: 300 });
    expect(results).toEqual([first, second]);
    expect(new Set(results).size).toBe(results.length);
  });

  it("handles empty and out-of-bounds queries", () => {
    const wall: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const index = new StaticSpatialIndex([wall], 100);

    expect(index.query({ x: 200, y: 200, width: 10, height: 10 })).toEqual([]);
    expect(index.query({ x: 0, y: 0, width: 0, height: 10 })).toEqual([]);
    expect(new StaticSpatialIndex([], 100).query({ x: -100, y: -100, width: 500, height: 500 })).toEqual([]);
  });
});
