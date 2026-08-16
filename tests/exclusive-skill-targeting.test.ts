import { describe, expect, it } from "vitest";

import { resolveExclusiveSkillTargeting } from "../src/shared/exclusive-skill-targeting";
import { ARENA_HEIGHT, ARENA_WIDTH, PLAYER_RADIUS } from "../src/shared/constants";
import { MAP_CATALOG } from "../src/shared/map-catalog";

describe("exclusive skill targeting", () => {
  it.each(MAP_CATALOG)("rejects a phase destination inside $id walls", (map) => {
    const wall = map.walls[0]!;
    const origin = { x: wall.x - PLAYER_RADIUS - 60, y: wall.y + wall.height / 2 };
    const range = wall.width / 2 + PLAYER_RADIUS + 60;
    const result = resolveExclusiveSkillTargeting({
      skillId: "phase-shift",
      origin,
      direction: { x: 1, y: 0 },
      range,
      bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
      playerRadius: PLAYER_RADIUS,
      walls: map.walls,
    });

    expect(result.valid).toBe(false);
    expect(result.path.from).toEqual(origin);
    expect(result.path.to).toEqual(result.endpoint);
  });

  it.each(MAP_CATALOG)("lets phase travel through $id walls when the endpoint is safe", (map) => {
    const wall = map.walls[0]!;
    const origin = { x: wall.x - PLAYER_RADIUS - 60, y: wall.y + wall.height / 2 };
    const range = wall.width + PLAYER_RADIUS * 2 + 120;
    const result = resolveExclusiveSkillTargeting({
      skillId: "phase-shift",
      origin,
      direction: { x: 1, y: 0 },
      range,
      bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
      playerRadius: PLAYER_RADIUS,
      walls: map.walls,
    });

    expect(result.valid).toBe(true);
    expect(result.endpoint.x).toBeGreaterThan(wall.x + wall.width + PLAYER_RADIUS);
  });

  it("stops Blaze at the first wall and marks out-of-bounds phase targets invalid", () => {
    const wall = { x: 300, y: 100, width: 80, height: 200 };
    const blaze = resolveExclusiveSkillTargeting({
      skillId: "breach",
      origin: { x: 100, y: 200 },
      direction: { x: 1, y: 0 },
      range: 400,
      bounds: { width: 800, height: 600 },
      playerRadius: 20,
      walls: [wall],
    });
    const phase = resolveExclusiveSkillTargeting({
      skillId: "phase-shift",
      origin: { x: 740, y: 200 },
      direction: { x: 1, y: 0 },
      range: 400,
      bounds: { width: 800, height: 600 },
      playerRadius: 20,
      walls: [],
    });

    expect(blaze.valid).toBe(true);
    expect(blaze.endpoint.x).toBeCloseTo(280, 3);
    expect(phase.valid).toBe(false);
    expect(phase.endpoint.x).toBe(780);
  });
});
