import { describe, expect, it } from "vitest";
import { runV4LoadSimulation, validateV4LoadReport } from "../scripts/v4-load-test";

describe("team elimination load matrix", () => {
  it.each(["reactor-core", "neon-docks", "crystal-ruins"] as const)("keeps six players round-safe on %s", (mapId) => {
    for (const mapEventsEnabled of [true, false]) {
      const report = runV4LoadSimulation(12, "teamElimination3v3", mapId, { mapEventsEnabled });
      expect(validateV4LoadReport(report), `${mapId}/events=${mapEventsEnabled}`).toEqual([]);
      expect(report.mode).toBe("teamElimination3v3");
      expect(report.eliminationPhasesObserved).toBeGreaterThanOrEqual(2);
      expect(report.eliminationRoundIndex).toBeGreaterThanOrEqual(1);
      expect(report.illegalZoneOverlaps).toBe(0);
      expect(report.wallViolations).toBe(0);
      expect(report.postFinishApplications).toBe(0);
      if (!mapEventsEnabled) expect(report.eventCount).toBe(0);
    }
  });
});
