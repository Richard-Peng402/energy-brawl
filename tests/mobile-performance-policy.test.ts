import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const mobileAppSource = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const gameSceneSource = readFileSync(new URL("../src/client/game-scene.ts", import.meta.url), "utf8");

describe("v4.2.1 high-fidelity client policy", () => {
  it("does not lower the snapshot cadence after slow frame windows", () => {
    expect(mobileAppSource).not.toContain('snapshotMode: this.slowFrameWindows >= 2 ? "reduced" : "full"');
    expect(mobileAppSource).not.toContain("sendPerformanceHint");
  });

  it("does not contain a low-performance visual rendering branch", () => {
    expect(gameSceneSource).not.toContain("lowPerformance");
    expect(gameSceneSource).not.toContain("setSnapshotMode");
    expect(gameSceneSource).not.toContain("applyPerformanceMode");
  });
});
