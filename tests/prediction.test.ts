import { describe, expect, it } from "vitest";

import { ARENA_SCALE, PLAYER_RADIUS, PLAYER_SPEED } from "../src/shared/constants";
import { predictLocalPosition } from "../src/client/prediction";
import { MAP_CATALOG } from "../src/shared/map-catalog";
import { InputReconciler } from "../src/client/input-reconciliation";

describe("local movement prediction", () => {
  it("applies normalized input immediately using server movement speed", () => {
    const next = predictLocalPosition({ x: 200, y: 200 }, { x: 1, y: 1 }, 100);

    expect(Math.hypot(next.x - 200, next.y - 200)).toBeCloseTo(PLAYER_SPEED * 0.1);
  });

  it("does not predict through solid walls", () => {
    const startX = 900 * ARENA_SCALE;
    const next = predictLocalPosition(
      { x: startX, y: 500 * ARENA_SCALE },
      { x: 1, y: 0 },
      100,
    );

    expect(next.x).toBeLessThanOrEqual(930 * ARENA_SCALE - PLAYER_RADIUS);
    expect(next.x).toBeGreaterThan(startX);
  });

  it("uses the full movement delta just like the authoritative simulation", () => {
    const next = predictLocalPosition({ x: 200, y: 200 }, { x: 1, y: 0 }, 200);

    expect(next.x - 200).toBeCloseTo(PLAYER_SPEED * 0.2);
  });

  it("uses the selected character's dynamic movement speed", () => {
    const next = predictLocalPosition({ x: 200, y: 200 }, { x: 1, y: 0 }, 100, 282);

    expect(next.x - 200).toBeCloseTo(28.2);
  });

  it.each(MAP_CATALOG)("uses $name walls for local prediction", (map) => {
    const wall = map.id === "crystal-ruins" ? map.walls[4]! : map.walls[0]!;
    const start = {
      x: wall.x - PLAYER_RADIUS - 20,
      y: wall.y + wall.height / 2,
    };

    const next = predictLocalPosition(start, { x: 1, y: 0 }, 300, PLAYER_SPEED, map.id);

    expect(next.x).toBeLessThanOrEqual(wall.x - PLAYER_RADIUS);
    expect(next.y).toBeCloseTo(start.y);
  });

  it.each(MAP_CATALOG)("keeps keyboard, diagonal and touch paths wall-safe on $name", (map) => {
    const horizontal = map.walls.find((wall) => wall.width > wall.height)!;
    const vertical = map.walls.find((wall) => wall.height > wall.width)!;
    const cases = [
      { wall: horizontal, start: { x: horizontal.x + horizontal.width / 2, y: horizontal.y - PLAYER_RADIUS - 8 }, input: { x: 0, y: 1 } },
      { wall: vertical, start: { x: vertical.x - PLAYER_RADIUS - 8, y: vertical.y + vertical.height / 2 }, input: { x: 1, y: 0 } },
      { wall: horizontal, start: { x: horizontal.x - PLAYER_RADIUS - 8, y: horizontal.y - PLAYER_RADIUS - 8 }, input: { x: 0.42, y: 0.68 } },
    ];
    for (const [index, scenario] of cases.entries()) {
      const predicted = predictLocalPosition(scenario.start, scenario.input, 300, PLAYER_SPEED, map.id);
      const hits = predicted.x + PLAYER_RADIUS > scenario.wall.x && predicted.x - PLAYER_RADIUS < scenario.wall.x + scenario.wall.width
        && predicted.y + PLAYER_RADIUS > scenario.wall.y && predicted.y - PLAYER_RADIUS < scenario.wall.y + scenario.wall.height;
      expect(hits, `case ${index} entered a wall`).toBe(false);

      const reconciler = new InputReconciler(map.id);
      reconciler.reconcile(playerAt(scenario.start.x, scenario.start.y, 0));
      reconciler.add({ seq: 1, moveX: scenario.input.x, moveY: scenario.input.y, aimX: 1, aimY: 0, firing: false }, 300);
      const reconciled = reconciler.reconcile(playerAt(scenario.start.x, scenario.start.y, 0), predicted);
      expect(reconciled.correctionDistance).toBeLessThan(30);
    }
  });
});

function playerAt(x: number, y: number, lastProcessedInput: number) {
  return {
    id: "p", nickname: "P", characterId: "blaze" as const, color: "#fff", isBot: false, connected: true, ready: true,
    x, y, vx: 0, vy: 0, angle: 0, health: 100, maxHealth: 100, damage: 27, moveSpeed: PLAYER_SPEED,
    fireCooldownMs: 450, projectileSpeed: 620, score: 0, kills: 0, energyCollected: 0, alive: true,
    respawnAt: null, shieldUntil: 0, skillShieldHealth: 0, skillShieldUntil: 0, lastProcessedInput,
    skillSlot: { type: null, charges: 0 as const }, lastProcessedSkillAction: 0, teamId: null,
  };
}
