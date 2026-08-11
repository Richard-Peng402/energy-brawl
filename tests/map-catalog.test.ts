import { describe, expect, it } from "vitest";

import { MAP_CATALOG, getMapDefinition, resolveMapSelection } from "../src/shared/map-catalog";

describe("map catalog", () => {
  it("ships three complete arena configurations", () => {
    expect(MAP_CATALOG).toHaveLength(3);
    for (const map of MAP_CATALOG) {
      expect(map.spawnPoints).toHaveLength(6);
      expect(map.energySpawnPoints.length).toBeGreaterThanOrEqual(6);
      expect(map.walls.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("rotates random matches away from the previous map when possible", () => {
    const first = getMapDefinition("reactor-core");
    const next = resolveMapSelection("random", first.id, 0);

    expect(next.id).not.toBe(first.id);
  });
});

