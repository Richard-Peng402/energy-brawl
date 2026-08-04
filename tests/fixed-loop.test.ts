import { describe, expect, it } from "vitest";

import { SERVER_TICK_MS } from "../src/shared/constants";
import { FixedStepAccumulator } from "../src/server/fixed-loop";

describe("fixed step accumulator", () => {
  it("produces exact fixed steps while preserving the remainder", () => {
    const loop = new FixedStepAccumulator(10);
    const deltas: number[] = [];

    expect(loop.advance(100, (delta) => deltas.push(delta))).toBe(0);
    expect(loop.advance(135, (delta) => deltas.push(delta))).toBe(3);
    expect(loop.advance(140, (delta) => deltas.push(delta))).toBe(1);
    expect(deltas).toEqual([10, 10, 10, 10]);
    expect(loop.droppedMs).toBe(0);
  });

  it("caps catch-up work and records excess full steps as dropped time", () => {
    const loop = new FixedStepAccumulator(10, 3);
    loop.advance(0, () => undefined);

    expect(loop.advance(105, () => undefined)).toBe(3);
    expect(loop.droppedMs).toBe(70);
    expect(loop.advance(110, () => undefined)).toBe(1);
  });

  it("clamps a backwards clock without producing work", () => {
    const loop = new FixedStepAccumulator(10);
    loop.advance(100, () => undefined);

    expect(loop.advance(90, () => undefined)).toBe(0);
    expect(loop.advance(110, () => undefined)).toBe(1);
  });

  it("produces exactly sixty fixed steps per simulated second", () => {
    const loop = new FixedStepAccumulator(SERVER_TICK_MS, 60);
    loop.advance(0, () => undefined);

    expect(loop.advance(1_000, () => undefined)).toBe(60);
  });
});
