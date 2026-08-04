import { describe, expect, it } from "vitest";

import { shouldAdvanceSnapshotAnchor, SnapshotBuffer } from "../src/client/snapshot-buffer";

interface TimedPosition {
  serverTime: number;
  x: number;
}

describe("snapshot buffer", () => {
  it("sorts snapshots and samples the surrounding server timestamps", () => {
    const buffer = new SnapshotBuffer<TimedPosition>();
    buffer.push({ serverTime: 200, x: 20 });
    buffer.push({ serverTime: 100, x: 10 });

    expect(buffer.sample(150)).toEqual({
      older: { serverTime: 100, x: 10 },
      newer: { serverTime: 200, x: 20 },
      alpha: 0.5,
    });
  });

  it("replaces duplicate timestamps and clamps late samples to the newest state", () => {
    const buffer = new SnapshotBuffer<TimedPosition>();
    buffer.push({ serverTime: 100, x: 10 });
    buffer.push({ serverTime: 200, x: 20 });
    buffer.push({ serverTime: 200, x: 22 });

    expect(buffer.sample(350)).toEqual({
      older: { serverTime: 100, x: 10 },
      newer: { serverTime: 200, x: 22 },
      alpha: 1,
    });
  });

  it("keeps only the newest bounded history", () => {
    const buffer = new SnapshotBuffer<TimedPosition>(2);
    buffer.push({ serverTime: 100, x: 10 });
    buffer.push({ serverTime: 200, x: 20 });
    buffer.push({ serverTime: 300, x: 30 });

    expect(buffer.sample(100)?.older.serverTime).toBe(200);
  });

  it("clamps before the first timestamp and rejects invalid render time", () => {
    const buffer = new SnapshotBuffer<TimedPosition>();
    buffer.push({ serverTime: 100, x: 10 });
    buffer.push({ serverTime: 200, x: 20 });

    expect(buffer.sample(50)).toEqual({
      older: { serverTime: 100, x: 10 },
      newer: { serverTime: 100, x: 10 },
      alpha: 0,
    });
    expect(buffer.sample(Number.NaN)).toBeNull();
  });

  it("advances receipt time only when server time moves forward", () => {
    expect(shouldAdvanceSnapshotAnchor(null, 100)).toBe(true);
    expect(shouldAdvanceSnapshotAnchor(100, 100)).toBe(false);
    expect(shouldAdvanceSnapshotAnchor(200, 100)).toBe(false);
    expect(shouldAdvanceSnapshotAnchor(100, 101)).toBe(true);
  });
});
