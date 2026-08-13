import { describe, expect, it } from "vitest";

import { buildRadarFrame, projectRadarPoint } from "../src/client/tactical-radar";
import type { GameSnapshot, PlayerSnapshot } from "../src/shared/protocol";

describe("tactical radar", () => {
  it("projects arena coordinates and active map walls into a bounded square", () => {
    expect(projectRadarPoint({ x: 1_440, y: 810 }, 160)).toEqual({ x: 80, y: 80 });
    const frame = buildRadarFrame(snapshot(), "local", 160);
    expect(frame.walls.length).toBeGreaterThan(0);
    expect(frame.walls.every((wall) => wall.x >= 0 && wall.y >= 0 && wall.x + wall.width <= 160 && wall.y + wall.height <= 160)).toBe(true);
  });

  it("shows teammates and only nearby line-of-sight enemies", () => {
    const game = snapshot({
      players: [
        player({ id: "local", x: 200, y: 200, teamId: "red" }),
        player({ id: "ally", x: 300, y: 200, teamId: "red" }),
        player({ id: "near-enemy", x: 500, y: 200, teamId: "blue" }),
        player({ id: "far-enemy", x: 2_000, y: 1_200, teamId: "blue" }),
      ],
    });

    const frame = buildRadarFrame(game, "local", 160);

    expect(frame.players.map((marker) => marker.id)).toEqual(["local", "ally", "near-enemy"]);
  });

  it("includes energy, skill orbs, and capture objective without unbounded marker growth", () => {
    const game = snapshot({
      energy: Array.from({ length: 40 }, (_, index) => ({ id: `e${index}`, x: index * 20, y: 100 })),
      skillOrbs: Array.from({ length: 20 }, (_, index) => ({ id: `s${index}`, type: "dash" as const, x: 100, y: index * 20 })),
      capturePoint: { x: 1_440, y: 810, radius: 180, ownerTeamId: null, progress: 0, targetProgress: 100, contestingTeams: [], state: "neutral" },
    });

    const frame = buildRadarFrame(game, "local", 160);

    expect(frame.energy).toHaveLength(12);
    expect(frame.skillOrbs).toHaveLength(8);
    expect(frame.capturePoint).toMatchObject({ x: 80, y: 80 });
  });
});

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    serverTime: 1_000, phase: "playing", remainingMs: 60_000, overtimePlayerIds: [], winnerIds: [],
    holderId: null, holdRemainingMs: null, finishedAt: null, matchMvpId: null, matchMvpScore: null,
    players: [player({ id: "local" })], projectiles: [], energy: [], skillOrbs: [],
    matchMode: "team3v3", mapId: "reactor-core", capturePoint: null,
    ...overrides,
  };
}

function player(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: "p", nickname: "P", characterId: "blaze", color: "#f00", isBot: false, connected: true,
    ready: true, x: 200, y: 200, vx: 0, vy: 0, angle: 0, health: 100, maxHealth: 100,
    damage: 20, moveSpeed: 250, fireCooldownMs: 400, projectileSpeed: 600, score: 0, kills: 0,
    energyCollected: 0, alive: true, respawnAt: null, shieldUntil: 0, skillShieldHealth: 0,
    skillShieldUntil: 0, lastProcessedInput: 0, skillSlot: { type: null, charges: 0 },
    lastProcessedSkillAction: 0, teamId: "red", ...overrides,
  };
}
