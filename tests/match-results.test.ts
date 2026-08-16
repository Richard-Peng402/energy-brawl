import { describe, expect, it } from "vitest";

import {
  calculateMapMechanicContributionScore,
  calculateMvpScore,
  selectMatchMvp,
} from "../src/shared/match-results";
import type { PlayerSnapshot } from "../src/shared/protocol";

describe("match MVP", () => {
  it("uses the published weighted authoritative statistics", () => {
    expect(calculateMvpScore(player({
      kills: 2, assists: 3, deaths: 1, score: 4,
      damageDealt: 500, healingDone: 100, damageTaken: 200, skillContribution: 2,
    }))).toBe(1_765);
  });

  it("adds bounded map-mechanic contribution weights to the MVP score", () => {
    const mapMechanicContribution = {
      reactorEscapes: 2,
      neonDamage: 200,
      crystalResonances: 3,
      mechanicHealing: 40,
      mechanicEliminations: 2,
    };

    expect(calculateMapMechanicContributionScore(mapMechanicContribution)).toBe(515);
    expect(calculateMvpScore(player({ mapMechanicContribution }))).toBe(515);
  });

  it("breaks equal scores by fewer deaths, then assists, then stable id", () => {
    const candidates = [
      player({ id: "z", deaths: 2, assists: 5 }),
      player({ id: "b", deaths: 1, assists: 2, damageDealt: 240 }),
      player({ id: "a", deaths: 1, assists: 2, damageDealt: 240 }),
    ];

    expect(selectMatchMvp(candidates)).toEqual({ playerId: "a", score: calculateMvpScore(candidates[2]!) });
  });

  it("returns no MVP without players", () => {
    expect(selectMatchMvp([])).toEqual({ playerId: null, score: null });
  });
});

function player(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: "p1", nickname: "P1", characterId: "blaze", color: "#f00", isBot: false,
    connected: true, ready: true, x: 100, y: 100, vx: 0, vy: 0, angle: 0,
    health: 100, maxHealth: 100, damage: 20, moveSpeed: 250, fireCooldownMs: 400,
    projectileSpeed: 600, score: 0, kills: 0, assists: 0, deaths: 0,
    damageDealt: 0, healingDone: 0, damageTaken: 0, skillContribution: 0,
    energyCollected: 0, alive: true, respawnAt: null, shieldUntil: 0,
    skillShieldHealth: 0, skillShieldUntil: 0, lastProcessedInput: 0,
    skillSlot: { type: null, charges: 0 }, lastProcessedSkillAction: 0,
    ...overrides,
  };
}
