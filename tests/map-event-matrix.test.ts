import { describe, expect, it } from "vitest";

import { runV4LoadSimulation } from "../scripts/v4-load-test";
import { MAP_CATALOG } from "../src/shared/map-catalog";
import type { MatchMode } from "../src/shared/mode-catalog";

const modes: MatchMode[] = ["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2"];

describe("six-player map event matrix", () => {
  for (const map of MAP_CATALOG) {
    for (const mode of modes) {
      for (const mapEventsEnabled of [false, true]) {
        it(`${map.id} ${mode} events=${mapEventsEnabled}`, () => {
          const report = runV4LoadSimulation(50, mode, map.id, { mapMechanicsEnabled: true, mapEventsEnabled });
          expect(report.wallViolations).toBe(0);
          expect(report.expiredStateResidue).toBe(0);
          expect(report.mapEventsEnabled).toBe(mapEventsEnabled);
          if (mapEventsEnabled) expect(report.eventCount).toBeGreaterThan(0);
          else expect(report.eventCount).toBe(0);
          expect(report.peakProjectiles).toBeGreaterThanOrEqual(0);
        });
      }
    }
  }
});
