import { describe, expect, it } from "vitest";

import {
  didPickUpLocalSkill,
  effectCapacity,
  PROJECTILE_VIEW_CAPACITY,
  projectileAngle,
  shouldRenderProjectileImageEffect,
  shouldShowProjectileTrace,
  shouldEmitProjectileTrail,
  trailIntervalMs,
  selectCombatFeedbackEvents,
} from "../src/client/combat-feedback";
import type { GameSnapshot } from "../src/shared/protocol";

const snapshot = (overrides: Partial<GameSnapshot> = {}): GameSnapshot => ({
  serverTime: 1_000,
  phase: "playing",
  remainingMs: 100_000,
  overtimePlayerIds: [],
  winnerIds: [],
  holderId: null,
  holdRemainingMs: null,
  finishedAt: null,
  matchMvpId: null,
  matchMvpScore: null,
  players: [],
  projectiles: [],
  energy: [],
  skillOrbs: [],
  ...overrides,
});

describe("v3.3 projectile feedback", () => {
  it("aims the arcade projectile along its velocity", () => {
    expect(projectileAngle({ x: 0, y: 12 })).toBeCloseTo(Math.PI / 2);
    expect(projectileAngle({ x: -9, y: 0 })).toBeCloseTo(Math.PI);
  });

  it("samples trails only after both the time and distance thresholds", () => {
    const memory = { x: 100, y: 100, emittedAt: 1_000 };
    expect(shouldEmitProjectileTrail(memory, { x: 120, y: 100 }, 1_020, false)).toBe(false);
    expect(shouldEmitProjectileTrail(memory, { x: 108, y: 100 }, 1_050, false)).toBe(false);
    expect(shouldEmitProjectileTrail(memory, { x: 120, y: 100 }, 1_050, false)).toBe(true);
  });

  it("keeps every projectile effect visible even when an old reduced hint is supplied", () => {
    expect(trailIntervalMs(false)).toBe(34);
    expect(trailIntervalMs(true)).toBe(34);
    expect(shouldShowProjectileTrace(false)).toBe(true);
    expect(shouldShowProjectileTrace(true)).toBe(true);
    expect(shouldRenderProjectileImageEffect("trail", true)).toBe(true);
    expect(shouldRenderProjectileImageEffect("spark", true)).toBe(true);
    expect(shouldRenderProjectileImageEffect("smoke", true)).toBe(true);
  });

  it("recognizes only an observed empty-to-filled skill transition", () => {
    expect(didPickUpLocalSkill(undefined, "dash")).toBe(false);
    expect(didPickUpLocalSkill(null, "dash")).toBe(true);
    expect(didPickUpLocalSkill("dash", "dash")).toBe(false);
    expect(didPickUpLocalSkill("dash", null)).toBe(false);
  });

  it("preallocates enough projectile and trail views for six-player crossfire", () => {
    expect(PROJECTILE_VIEW_CAPACITY).toBe(256);
    expect(effectCapacity("trail")).toBe(160);
    expect(effectCapacity("impact")).toBe(36);
    expect(effectCapacity("spark")).toBe(96);
  });

  it("emits one deduplicated local damage and low-health edge per snapshot transition", () => {
    const previous = snapshot({ players: [{ id: "local", nickname: "本地", characterId: "blaze", color: "#fff", isBot: false, connected: true, ready: true, x: 0, y: 0, vx: 0, vy: 0, angle: 0, health: 80, maxHealth: 100, damage: 24, moveSpeed: 272, fireCooldownMs: 600, projectileSpeed: 660, score: 0, kills: 0, energyCollected: 0, alive: true, respawnAt: null, shieldUntil: 0, skillShieldHealth: 0, skillShieldUntil: 0, lastProcessedInput: 0, skillSlot: { type: null, charges: 0 }, lastProcessedSkillAction: 0 }] });
    const next = snapshot({ serverTime: 1_050, players: [{ ...previous.players[0]!, health: 25, lastDamagedAt: 1_040 }] });
    const events = selectCombatFeedbackEvents(previous, next, "local");
    expect(events.map((event) => event.type)).toEqual(["hurt", "low-health"]);
    expect(selectCombatFeedbackEvents(next, next, "local")).toEqual([]);
  });

  it("emits local kill and death events from stable authoritative edges", () => {
    const previous = snapshot({ players: [{ id: "local", nickname: "本地", characterId: "blaze", color: "#fff", isBot: false, connected: true, ready: true, x: 0, y: 0, vx: 0, vy: 0, angle: 0, health: 100, maxHealth: 100, damage: 24, moveSpeed: 272, fireCooldownMs: 600, projectileSpeed: 660, score: 0, kills: 0, energyCollected: 0, alive: true, respawnAt: null, shieldUntil: 0, skillShieldHealth: 0, skillShieldUntil: 0, lastProcessedInput: 0, skillSlot: { type: null, charges: 0 }, lastProcessedSkillAction: 0 }], killFeed: [] });
    const next = snapshot({ players: [{ ...previous.players[0]!, alive: false, health: 0 }], killFeed: [{ id: "kill-1", at: 1_000, killerId: "local", victimId: "enemy", streak: 1 }] });
    expect(selectCombatFeedbackEvents(previous, next, "local").map((event) => event.type)).toEqual(["death", "kill"]);
  });
});
