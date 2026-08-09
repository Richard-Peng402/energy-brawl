import { describe, expect, it } from "vitest";

import { MATCH_MODES, getModeDefinition, isCaptureMode, isMatchMode } from "../src/shared/mode-catalog";

describe("v4 match modes", () => {
  it("defines personal, 3v3, and 2v2v2 with scaled team targets", () => {
    expect(MATCH_MODES).toEqual(["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2"]);
    expect(getModeDefinition("solo")).toMatchObject({ teamCount: 0, teamSize: 1, targetScore: 20, objective: "score" });
    expect(getModeDefinition("team3v3")).toMatchObject({ teamCount: 2, teamSize: 3, targetScore: 60, objective: "score" });
    expect(getModeDefinition("team2v2v2")).toMatchObject({ teamCount: 3, teamSize: 2, targetScore: 40, objective: "score" });
    expect(getModeDefinition("domination3v3")).toMatchObject({ teamCount: 2, teamSize: 3, targetScore: 100, objective: "capture" });
    expect(getModeDefinition("domination2v2v2")).toMatchObject({ teamCount: 3, teamSize: 2, targetScore: 100, objective: "capture" });
    expect(isCaptureMode("domination3v3")).toBe(true);
  });

  it("rejects unknown modes", () => {
    expect(isMatchMode("solo")).toBe(true);
    expect(isMatchMode("capture")).toBe(false);
    expect(isMatchMode(null)).toBe(false);
  });
});
