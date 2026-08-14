import { describe, expect, it } from "vitest";
import { runV4LoadSimulation, validateV4LoadReport } from "../scripts/v4-load-test";

describe("v4 six-player load simulation", () => {
  it("reports every map, mode and mechanic-toggle combination", () => {
    for (const mapId of ["reactor-core", "neon-docks", "crystal-ruins"] as const) {
      for (const mode of ["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2"] as const) {
        for (const mapMechanicsEnabled of [true, false]) {
          const report = runV4LoadSimulation(1, mode, mapId, { mapMechanicsEnabled });
          expect(validateV4LoadReport(report), `${mapId}/${mode}/${mapMechanicsEnabled}`).toEqual([]);
          expect(report).toMatchObject({ mapId, mode, mapMechanicsEnabled });
          expect(report.illegalZoneOverlaps).toBe(0);
          expect(report.expiredMapStates).toBe(0);
          expect(report.postFinishApplications).toBe(0);
          expect(report.snapshotBytesP95).toBeGreaterThan(0);
          if (!mapMechanicsEnabled) {
            expect(report.mechanicWarnings).toBe(0);
            expect(report.mechanicActivations).toBe(0);
          }
        }
      }
    }
  });

  it("observes authoritative warning and activation transitions only when enabled", () => {
    const enabled = runV4LoadSimulation(25, "team3v3", "neon-docks", { mapMechanicsEnabled: true });
    expect(enabled.mechanicWarnings).toBe(1);
    expect(enabled.mechanicActivations).toBe(1);

    const disabled = runV4LoadSimulation(25, "team3v3", "neon-docks", { mapMechanicsEnabled: false });
    expect(disabled.mechanicWarnings).toBe(0);
    expect(disabled.mechanicActivations).toBe(0);
  });

  it.each(["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2"] as const)(
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
