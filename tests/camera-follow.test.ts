import { describe, expect, it } from "vitest";

import { resolveCameraView, shouldSnapCameraOnEliminationRound, shouldSnapCameraOnRespawn } from "../src/client/camera-follow";

describe("camera follow", () => {
  const viewport = { width: 900, height: 500 };
  const arena = { width: 2_880, height: 1_620 };

  it("keeps the local player exactly at the camera center on every frame", () => {
    expect(resolveCameraView({ x: 1_480, y: 820 }, viewport, arena).center).toEqual({ x: 1_480, y: 820 });
  });

  it("extends camera bounds by half a viewport so edge players remain centered", () => {
    expect(resolveCameraView({ x: 27, y: 27 }, viewport, arena)).toEqual({
      center: { x: 27, y: 27 },
      bounds: { x: -450, y: -250, width: 3_780, height: 2_120 },
    });
    expect(resolveCameraView({ x: 2_853, y: 1_593 }, viewport, arena).center).toEqual({ x: 2_853, y: 1_593 });
  });

  it("clamps invalid target coordinates to the playable arena while preserving overscan", () => {
    expect(resolveCameraView({ x: -100, y: 1_900 }, viewport, arena).center).toEqual({ x: 0, y: 1_620 });
  });

  it("requests an immediate camera snap only when the local player respawns", () => {
    expect(shouldSnapCameraOnRespawn(false, true)).toBe(true);
    expect(shouldSnapCameraOnRespawn(true, true)).toBe(false);
    expect(shouldSnapCameraOnRespawn(true, false)).toBe(false);
  });

  it("requests a camera snap when an elimination round changes even without a respawn transition", () => {
    expect(shouldSnapCameraOnEliminationRound(2, 3)).toBe(true);
    expect(shouldSnapCameraOnEliminationRound(2, 2)).toBe(false);
    expect(shouldSnapCameraOnEliminationRound(null, 1)).toBe(false);
  });
});
