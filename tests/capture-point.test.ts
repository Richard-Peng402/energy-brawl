import { describe, expect, it } from "vitest";

import { advanceCapturePoint, createCapturePointState, DEFAULT_CAPTURE_POINT_CONFIG, isCapturePointComplete } from "../src/shared/capture-point";

describe("central capture point", () => {
  it("captures for one team and pauses while contested", () => {
    const red = [{ x: 1_440, y: 810, alive: true, teamId: "red" as const }];
    const state = advanceCapturePoint(createCapturePointState(), red, 10_000);
    expect(state.ownerTeamId).toBe("red");
    expect(state.progress).toBeCloseTo(15);
    expect(state.state).toBe("capturing");
    const contested = advanceCapturePoint(state, [...red, { x: 1_440, y: 810, alive: true, teamId: "blue" as const }], 10_000);
    expect(contested.state).toBe("contested");
    expect(contested.progress).toBe(state.progress);
  });

  it("hands the point to another team after neutralizing progress", () => {
    const red = advanceCapturePoint(createCapturePointState(), [{ x: 1_440, y: 810, alive: true, teamId: "red" }], 60_000);
    const neutralized = advanceCapturePoint(red, [{ x: 1_440, y: 810, alive: true, teamId: "blue" }], 60_000);
    const blue = advanceCapturePoint(neutralized, [{ x: 1_440, y: 810, alive: true, teamId: "blue" }], 10_000);
    expect(blue.ownerTeamId).toBe("blue");
    expect(blue.progress).toBeCloseTo(15);
  });

  it("recognizes the 100-point objective target", () => {
    expect(DEFAULT_CAPTURE_POINT_CONFIG.targetProgress).toBe(100);
    expect(isCapturePointComplete(100)).toBe(true);
    expect(isCapturePointComplete(99.9)).toBe(false);
  });
});
