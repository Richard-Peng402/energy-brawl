import { describe, expect, it } from "vitest";

import { MAP_CATALOG } from "../src/shared/map-catalog";
import { MAP_EVENT_DEFINITIONS, isMapEventKind } from "../src/shared/map-events";
import { circleHitsRect, distanceSquared } from "../src/shared/math";

describe("temporary map event catalog", () => {
  it("defines four readable and counterable events", () => {
    expect(MAP_EVENT_DEFINITIONS).toHaveLength(4);
    for (const event of MAP_EVENT_DEFINITIONS) {
      expect(isMapEventKind(event.kind)).toBe(true);
      expect(event.summary.length).toBeGreaterThan(8);
      expect(event.counterplay.length).toBeGreaterThan(8);
      expect(event.warningMs).toBeGreaterThan(0);
      expect(event.activeMs).toBeGreaterThan(0);
    }
  });

  it.each(MAP_CATALOG)("keeps $id supply points outside walls and spawn safety radii", (map) => {
    expect(map.eventSupplyPoints.length).toBeGreaterThanOrEqual(3);
    expect(map.eventLockdownZones.length).toBeGreaterThanOrEqual(2);
    expect(map.eventStormSafeZones.length).toBeGreaterThanOrEqual(2);
    for (const point of map.eventSupplyPoints) {
      expect(map.walls.some((wall) => circleHitsRect(point, 24, wall))).toBe(false);
      expect(map.spawnPoints.every((spawn) => distanceSquared(point, spawn) >= 170 ** 2)).toBe(true);
    }
  });
});
