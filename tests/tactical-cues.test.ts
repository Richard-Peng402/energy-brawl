import { describe, expect, it } from "vitest";

import { buildTacticalCues, projectOffscreenCue } from "../src/client/tactical-radar";
import type { GameSnapshot, PlayerSnapshot, Rect } from "../src/shared/protocol";

describe("tactical edge cues", () => {
  const viewport: Rect = { x: 100, y: 100, width: 600, height: 360 };

  it("hides in-view targets and clamps off-screen targets to the safe edge", () => {
    expect(projectOffscreenCue({ x: 300, y: 200 }, viewport, { width: 900, height: 500 }, 64)).toBeNull();
    expect(projectOffscreenCue({ x: 1_400, y: 280 }, viewport, { width: 900, height: 500 }, 64)).toMatchObject({ x: 836, y: expect.any(Number), angle: 0 });
  });

  it("prioritizes danger, contested objective, and teammate with a three-cue limit", () => {
    const cues = buildTacticalCues(snapshot(), "local", viewport, { width: 900, height: 500 }, { attackerId: "enemy", damagedAt: 9_000 });
    expect(cues.map((cue) => cue.kind)).toEqual(["danger", "objective", "teammate"]);
  });

  it("expires damage-source cues after three seconds", () => {
    const game = snapshot({ serverTime: 12_001 });
    const cues = buildTacticalCues(game, "local", viewport, { width: 900, height: 500 }, { attackerId: "enemy", damagedAt: 9_000 });
    expect(cues.some((cue) => cue.kind === "danger")).toBe(false);
  });
});

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    serverTime: 10_000, phase: "playing", remainingMs: 60_000, overtimePlayerIds: [], winnerIds: [],
    holderId: null, holdRemainingMs: null, finishedAt: null, matchMvpId: null, matchMvpScore: null,
    players: [player({ id: "local", x: 200, y: 200, teamId: "red" }), player({ id: "ally", x: 1_200, y: 700, teamId: "red" }), player({ id: "enemy", x: 1_500, y: 200, teamId: "blue" })],
    projectiles: [], energy: [], skillOrbs: [], matchMode: "domination3v3", mapId: "reactor-core",
    capturePoint: { x: 1_440, y: 810, radius: 180, ownerTeamId: "blue", progress: 40, targetProgress: 100, contestingTeams: ["red", "blue"], state: "contested" },
    ...overrides,
  };
}

function player(overrides: Partial<PlayerSnapshot>): PlayerSnapshot {
  return {
    id: "p", nickname: "P", characterId: "blaze", color: "#f00", isBot: false, connected: true,
    ready: true, x: 0, y: 0, vx: 0, vy: 0, angle: 0, health: 100, maxHealth: 100, damage: 20,
    moveSpeed: 250, fireCooldownMs: 400, projectileSpeed: 600, score: 0, kills: 0, energyCollected: 0,
    alive: true, respawnAt: null, shieldUntil: 0, skillShieldHealth: 0, skillShieldUntil: 0,
    lastProcessedInput: 0, skillSlot: { type: null, charges: 0 }, lastProcessedSkillAction: 0,
    teamId: null, ...overrides,
  };
}
