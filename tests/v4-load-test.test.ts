import { describe, expect, it } from "vitest";
import { runV4LoadSimulation, validateV4LoadReport } from "../scripts/v4-load-test";

describe("v4 six-player load simulation", () => {
  it.each(["team3v3", "domination3v3", "domination2v2v2"] as const)(
    "keeps a six-player %s skill-heavy match wall-safe and within the server tick budget",
    (mode) => {
      const report = runV4LoadSimulation(10, mode);
      expect(validateV4LoadReport(report)).toEqual([]);
      expect(report.mode).toBe(mode);
      expect(report.exclusiveSkillRequests).toBeGreaterThanOrEqual(6);
    },
  );

  it("broadcasts capture state during both domination load profiles", () => {
    for (const mode of ["domination3v3", "domination2v2v2"] as const) {
      const report = runV4LoadSimulation(10, mode);
      expect(report.capturePointObserved).toBe(true);
    }
  });

  it.each(["reactor-core", "neon-docks", "crystal-ruins"] as const)(
    "keeps six players wall-safe on %s",
    (mapId) => {
      const report = runV4LoadSimulation(5, "team3v3", mapId);
      expect(validateV4LoadReport(report)).toEqual([]);
      expect(report.mapId).toBe(mapId);
    },
  );
});
