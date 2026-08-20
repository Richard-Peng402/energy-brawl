import { describe, expect, it } from "vitest";
import { buildEliminationRoundContext } from "../src/client/elimination-ui";
import type { GameSnapshot } from "../src/shared/protocol";

describe("team elimination round context", () => {
  it("explains prep and local team side", () => {
    expect(buildEliminationRoundContext(snapshot("prep"), "red-1")).toContain("红队出生侧");
    expect(buildEliminationRoundContext(snapshot("prep"), "red-1")).toContain("第 2 回合准备");
  });

  it("explains the completed round and stays empty outside elimination", () => {
    expect(buildEliminationRoundContext(snapshot("result"), "red-1")).toContain("拿下第 2 回合");
    expect(buildEliminationRoundContext({ ...snapshot("live"), matchMode: "solo", elimination: null }, "red-1")).toBe("");
  });
});

function snapshot(phase: "prep" | "live" | "result"): GameSnapshot {
  return {
    serverTime: 1_000, phase: "playing", remainingMs: 40_000, overtimePlayerIds: [], winnerIds: [],
    holderId: null, holdRemainingMs: null, finishedAt: null, matchMvpId: null, matchMvpScore: null,
    players: [{ id: "red-1", nickname: "红方", characterId: "blaze", color: "#f00", isBot: false, connected: true, ready: true,
      x: 0, y: 0, vx: 0, vy: 0, angle: 0, health: 100, maxHealth: 100, damage: 20, moveSpeed: 250, fireCooldownMs: 400,
      projectileSpeed: 600, score: 0, kills: 0, energyCollected: 0, alive: true, respawnAt: null, shieldUntil: 0,
      skillShieldHealth: 0, skillShieldUntil: 0, lastProcessedInput: 0, skillSlot: { type: null, charges: 0 }, lastProcessedSkillAction: 0, teamId: "red" }],
    projectiles: [], energy: [], skillOrbs: [], matchMode: "teamElimination3v3", elimination: {
      phase, roundIndex: 2, roundScores: [{ teamId: "red", score: 1, targetScore: 4 }, { teamId: "blue", score: 0, targetScore: 4 }],
      deadline: 10_000, maxScoredRounds: 7, decisive: false,
      rounds: [{ roundIndex: 2, winnerTeamId: "red", reason: "eliminated", redAlive: 1, blueAlive: 0 }],
    },
  };
}
