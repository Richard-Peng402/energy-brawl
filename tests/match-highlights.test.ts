import { describe, expect, it } from "vitest";

import {
  advanceHighlightTracker,
  createMatchHighlightTracker,
  finalizeMatchHighlights,
  recordCaptureScore,
  recordFiveKillStreak,
  recordHazardEscape,
  recordHealingCandidate,
} from "../src/server/match-highlight-tracker";
import {
  applyWorldExclusiveSkill,
  createGameWorld,
  damagePlayer,
  finishWorldMatch,
  stepWorld,
  worldToSnapshot,
} from "../src/server/simulation";

describe("authoritative match highlights", () => {
  it("selects at most one of each kind and four total in stable priority order", () => {
    const tracker = createMatchHighlightTracker();
    recordFiveKillStreak(tracker, "player-1", 1_000, 6);
    recordFiveKillStreak(tracker, "player-2", 1_200, 5);
    recordHazardEscape(tracker, "player-2", 900, "reactor-vent");

    expect(finalizeMatchHighlights(tracker, snapshot()).map((item) => item.kind)).toEqual([
      "five-kill-streak",
      "hazard-escape",
    ]);
  });

  it("confirms critical healing only when the target survives four seconds", () => {
    const tracker = createMatchHighlightTracker();
    recordHealingCandidate(tracker, {
      healerId: "medic",
      targetId: "ally",
      beforeHealthRatio: 0.2,
      amount: 20,
      at: 1_000,
    });
    advanceHighlightTracker(tracker, 4_999, ["medic", "ally"]);
    expect(finalizeMatchHighlights(tracker, snapshot())).toHaveLength(0);
    advanceHighlightTracker(tracker, 5_000, ["medic", "ally"]);
    expect(finalizeMatchHighlights(tracker, snapshot())[0]).toMatchObject({
      kind: "critical-healing",
      playerId: "medic",
      targetPlayerId: "ally",
      value: 20,
    });
  });

  it("rejects healing when the target dies during the confirmation window", () => {
    const tracker = createMatchHighlightTracker();
    recordHealingCandidate(tracker, { healerId: "medic", targetId: "ally", beforeHealthRatio: 0.25, amount: 22, at: 1_000 });
    advanceHighlightTracker(tracker, 3_000, ["medic"]);
    advanceHighlightTracker(tracker, 6_000, ["medic", "ally"]);
    expect(finalizeMatchHighlights(tracker, snapshot())).toEqual([]);
  });

  it("aggregates healing within one second before applying the threshold", () => {
    const tracker = createMatchHighlightTracker();
    recordHealingCandidate(tracker, { healerId: "medic", targetId: "ally", beforeHealthRatio: 0.2, amount: 10, at: 1_000 });
    recordHealingCandidate(tracker, { healerId: "medic", targetId: "ally", beforeHealthRatio: 0.24, amount: 9, at: 1_700 });
    advanceHighlightTracker(tracker, 5_700, ["medic", "ally"]);
    expect(finalizeMatchHighlights(tracker, snapshot())[0]).toMatchObject({ kind: "critical-healing", value: 19 });
  });

  it("awards a capture comeback to the winning team's highest contributor", () => {
    const tracker = createMatchHighlightTracker();
    recordCaptureScore(tracker, {
      at: 1_000,
      targetScore: 100,
      scores: { red: 10, blue: 35 },
      scoringTeamId: "blue",
      scoreDelta: 1,
      contributorIds: ["blue-1"],
    });
    recordCaptureScore(tracker, {
      at: 2_000,
      targetScore: 100,
      scores: { red: 36, blue: 35 },
      scoringTeamId: "red",
      scoreDelta: 26,
      contributorIds: ["red-1", "red-2"],
    });
    recordCaptureScore(tracker, {
      at: 3_000,
      targetScore: 100,
      scores: { red: 40, blue: 35 },
      scoringTeamId: "red",
      scoreDelta: 4,
      contributorIds: ["red-1"],
    });

    expect(finalizeMatchHighlights(tracker, snapshot({ winnerIds: ["red-1", "red-2"] }))).toContainEqual(expect.objectContaining({
      kind: "capture-comeback",
      playerId: "red-1",
      value: 25,
    }));
  });

  it("returns no fabricated highlights for an empty tracker", () => {
    expect(finalizeMatchHighlights(createMatchHighlightTracker(), snapshot())).toEqual([]);
  });

  it("publishes a five-kill streak only in the finished authoritative snapshot", () => {
    const world = createGameWorld([
      { id: "killer", nickname: "连杀者", characterId: "blaze", isBot: false },
      { id: "victim", nickname: "目标", characterId: "medic", isBot: false },
    ]);
    const victim = world.players.get("victim")!;
    victim.shieldUntil = 0;
    for (let count = 0; count < 5; count += 1) {
      expect(damagePlayer(world, victim.id, "killer", 999)).toBe(true);
      victim.alive = true;
      victim.health = victim.maxHealth;
      victim.respawnAt = null;
      victim.shieldUntil = 0;
    }
    expect(worldToSnapshot(world).matchHighlights).toBeUndefined();
    finishWorldMatch(world, ["killer"]);
    expect(worldToSnapshot(world).matchHighlights).toContainEqual(expect.objectContaining({
      kind: "five-kill-streak",
      playerId: "killer",
      value: 5,
    }));
  });

  it("records a pulse-heal highlight after the ally survives four seconds", () => {
    const world = createGameWorld([
      { id: "medic", nickname: "医师", characterId: "medic", isBot: false, teamId: "red" },
      { id: "ally", nickname: "队友", characterId: "fortress", isBot: false, teamId: "red" },
      { id: "enemy", nickname: "敌人", characterId: "blaze", isBot: false, teamId: "blue" },
    ], 0, "team3v3");
    const medic = world.players.get("medic")!;
    const ally = world.players.get("ally")!;
    ally.x = medic.x + 40;
    ally.y = medic.y;
    ally.health = ally.maxHealth * 0.2;

    expect(applyWorldExclusiveSkill(world, medic.id, { x: 1, y: 0 })).toBe(true);
    stepWorld(world, 4_000);
    finishWorldMatch(world, [medic.id, ally.id]);

    expect(worldToSnapshot(world).matchHighlights).toContainEqual(expect.objectContaining({
      kind: "critical-healing",
      playerId: medic.id,
      targetPlayerId: ally.id,
    }));
  });
});

function snapshot(overrides: Partial<Parameters<typeof finalizeMatchHighlights>[1]> = {}): Parameters<typeof finalizeMatchHighlights>[1] {
  return {
    winnerIds: [],
    players: [
      { id: "player-1", nickname: "一号", teamId: null },
      { id: "player-2", nickname: "二号", teamId: null },
      { id: "medic", nickname: "医师", teamId: "red" },
      { id: "ally", nickname: "队友", teamId: "red" },
      { id: "red-1", nickname: "红一", teamId: "red" },
      { id: "red-2", nickname: "红二", teamId: "red" },
      { id: "blue-1", nickname: "蓝一", teamId: "blue" },
    ],
    ...overrides,
  };
}
