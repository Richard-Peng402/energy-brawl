import { describe, expect, it, vi } from "vitest";
import { eliminationRoundAudioCue } from "../src/client/combat-audio";
import { CombatHaptics } from "../src/client/combat-haptics";
import { selectEliminationRoundFeedback } from "../src/client/elimination-feedback";
import type { GameSnapshot } from "../src/shared/protocol";

describe("team elimination round feedback", () => {
  it("selects one local win or loss event and deduplicates repeated snapshots", () => {
    const win = selectEliminationRoundFeedback(snapshot("red"), "red-1", "");
    expect(win.event).toMatchObject({ outcome: "win", roundIndex: 2 });
    expect(selectEliminationRoundFeedback(snapshot("red"), "red-1", win.revision).event).toBeNull();
    expect(selectEliminationRoundFeedback(snapshot("red"), "blue-1", "").event).toMatchObject({ outcome: "loss" });
    expect(selectEliminationRoundFeedback({ ...snapshot("red"), matchMode: "solo", elimination: null }, "red-1", win.revision)).toEqual({ event: null, revision: "" });
  });

  it("uses distinct multi-stage audio profiles for wins and losses", () => {
    const win = eliminationRoundAudioCue("win");
    const loss = eliminationRoundAudioCue("loss");
    expect(win).not.toEqual(loss);
    expect(win.length).toBeGreaterThanOrEqual(3);
    expect(win.at(-1)!.endFrequency).toBeGreaterThan(win[0]!.startFrequency);
    expect(loss.at(-1)!.endFrequency).toBeLessThan(loss[0]!.startFrequency);
  });

  it("plays distinct bounded haptics once per round event", () => {
    const vibrate = vi.fn((_pattern: number | readonly number[]) => true);
    const haptics = new CombatHaptics({ vibrate });
    const win = { key: "round:2:win", outcome: "win" as const, roundIndex: 2 };
    const loss = { key: "round:3:loss", outcome: "loss" as const, roundIndex: 3 };
    haptics.handleEliminationRound(win);
    haptics.handleEliminationRound(win);
    haptics.handleEliminationRound(loss);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate.mock.calls[0]?.[0]).not.toEqual(vibrate.mock.calls[1]?.[0]);
    for (const [rawPattern] of vibrate.mock.calls) {
      const pattern = Array.isArray(rawPattern) ? rawPattern : [rawPattern];
      expect(pattern.every((value) => value <= 120)).toBe(true);
      expect(pattern.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(300);
    }
  });
});

function snapshot(winnerTeamId: "red" | "blue"): GameSnapshot {
  return {
    serverTime: 20_000, phase: "playing", remainingMs: 0, overtimePlayerIds: [], winnerIds: [], holderId: null,
    holdRemainingMs: null, finishedAt: null, matchMvpId: null, matchMvpScore: null,
    players: [player("red-1", "red"), player("blue-1", "blue")], projectiles: [], energy: [], skillOrbs: [],
    matchMode: "teamElimination3v3", elimination: {
      phase: "result", roundIndex: 2, deadline: 24_000, maxScoredRounds: 7, decisive: false,
      roundScores: [{ teamId: "red", score: 1, targetScore: 4 }, { teamId: "blue", score: 1, targetScore: 4 }],
      rounds: [{ roundIndex: 2, winnerTeamId, reason: "eliminated", redAlive: winnerTeamId === "red" ? 2 : 0, blueAlive: winnerTeamId === "blue" ? 2 : 0 }],
    },
  };
}

function player(id: string, teamId: "red" | "blue"): GameSnapshot["players"][number] {
  return {
    id, nickname: id, characterId: "blaze", color: "#fff", isBot: false, connected: true, ready: true,
    x: 0, y: 0, vx: 0, vy: 0, angle: 0, health: 100, maxHealth: 100, damage: 20, moveSpeed: 250,
    fireCooldownMs: 400, projectileSpeed: 600, score: 0, kills: 0, energyCollected: 0, alive: true,
    respawnAt: null, shieldUntil: 0, skillShieldHealth: 0, skillShieldUntil: 0, lastProcessedInput: 0,
    skillSlot: { type: null, charges: 0 }, lastProcessedSkillAction: 0, teamId,
  };
}
