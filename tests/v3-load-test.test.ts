import { describe, expect, it } from "vitest";

import { PROJECTILE_RADIUS, PLAYER_RADIUS, WALLS } from "../src/shared/constants";
import type { GameSnapshot } from "../src/shared/protocol";
import {
  DEFAULT_LOAD_TEST_SECONDS,
  createLoadTestPlan,
  countWallViolations,
  validateLoadTestReport,
} from "../scripts/v3-load-test";

const emptySnapshot = (overrides: Partial<GameSnapshot> = {}): GameSnapshot => ({
  serverTime: 0,
  phase: "playing",
  remainingMs: 480_000,
  overtimePlayerIds: [],
  winnerIds: [],
  holderId: null,
  holdRemainingMs: null,
  finishedAt: null,
  players: [],
  projectiles: [],
  energy: [],
  skillOrbs: [],
  ...overrides,
});

describe("v3 load test plan and invariants", () => {
  it("plans six unique characters and a ten-minute, two-match endurance run", () => {
    const plan = createLoadTestPlan();
    expect(DEFAULT_LOAD_TEST_SECONDS).toBe(600);
    expect(plan.clients).toHaveLength(6);
    expect(new Set(plan.clients.map((client) => client.characterId)).size).toBe(6);
    expect(plan.durationSeconds).toBe(600);
    expect(plan.requiredMatches).toBe(2);
  });

  it("counts player and projectile overlaps with solid walls", () => {
    const wall = WALLS[0]!;
    const snapshot = emptySnapshot({
      players: [{ id: "p", nickname: "P", characterId: "blaze", color: "#f00", isBot: false, connected: true, ready: true, x: wall.x + wall.width / 2, y: wall.y + wall.height / 2, vx: 0, vy: 0, angle: 0, health: 94, maxHealth: 94, damage: 27, moveSpeed: 265, fireCooldownMs: 450, projectileSpeed: 620, score: 0, kills: 0, energyCollected: 0, alive: true, respawnAt: null, shieldUntil: 0, skillShieldHealth: 0, skillShieldUntil: 0, lastProcessedInput: 0, skillSlot: { type: null, charges: 0 }, lastProcessedSkillAction: 0 }],
      projectiles: [{ id: "b", ownerId: "p", x: wall.x + wall.width / 2, y: wall.y + wall.height / 2, vx: 1, vy: 0 }],
    });
    expect(countWallViolations(snapshot)).toBeGreaterThanOrEqual(2);
    expect(PROJECTILE_RADIUS).toBeGreaterThan(0);
    expect(PLAYER_RADIUS).toBeGreaterThan(PROJECTILE_RADIUS);
  });

  it("rejects an endurance report with missing matches, skills, admin commands, or wall safety", () => {
    const errors = validateLoadTestReport({
      url: "http://127.0.0.1:3000",
      seconds: 600,
      clients: 6,
      starts: 1,
      snapshots: [100, 100, 100, 100, 100, 100],
      minimumSnapshots: 100,
      skillActions: 0,
      adminCommands: 0,
      kicks: 0,
      forcedWinners: 0,
      wallViolations: 1,
    });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("two matches"),
      expect.stringContaining("skill"),
      expect.stringContaining("host"),
      expect.stringContaining("wall"),
    ]));
  });
});
