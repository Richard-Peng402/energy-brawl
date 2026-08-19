import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEliminationHud, buildEliminationRoundHistory, buildEliminationRoundResult, buildEliminationSpectator } from "../src/client/elimination-ui";
import type { GameSnapshot } from "../src/shared/protocol";

const hostSource = readFileSync(new URL("../src/client/host-app.ts", import.meta.url), "utf8");
const mobileSource = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");

describe("team elimination host controls", () => {
  it("exposes the elimination mode and lobby-only round controls", () => {
    expect(hostSource).toContain('value="teamElimination3v3"');
    expect(hostSource).toContain("host-elimination-rules");
    expect(hostSource).toContain("setEliminationRules");
    expect(hostSource).toContain("eliminationRules");
  });

  it("renders authoritative score, phase and alive counts", () => {
    const view = buildEliminationHud(snapshot(), "red-1");
    expect(view).toEqual({
      visible: true,
      scoreLabel: "红队 2 : 1 蓝队",
      roundLabel: "第 4 / 7 回合",
      phaseLabel: "战斗",
      countdownLabel: "18s",
      aliveLabel: "存活 2 - 1",
    });
  });

  it("selects a same-team alive player for death spectating", () => {
    expect(buildEliminationSpectator(snapshot({ ownAlive: false }), "red-1")).toEqual({ visible: true, targetName: "红队友" });
    expect(buildEliminationSpectator(snapshot({ ownAlive: true }), "red-1")).toEqual({ visible: false, targetName: null });
    expect(mobileSource).toContain("const showRespawnCountdown = !snapshot.elimination && own?.alive === false");
  });

  it("hides the normal score and clock overlays while elimination HUD is active", () => {
    expect(mobileSource).toContain('const eliminationMode = snapshot.matchMode === "teamElimination3v3" && snapshot.elimination !== null');
    expect(mobileSource).toContain('this.find<HTMLElement>("#match-clock").classList.toggle("is-hidden", eliminationMode)');
    expect(mobileSource).toContain('this.find<HTMLElement>("#team-score").classList.toggle("is-hidden", eliminationMode)');
  });

  it("keeps round result as one concise announcement", () => {
    expect(buildEliminationRoundResult(snapshot({ phase: "result" }))).toEqual({ visible: true, text: "第 4 回合：红队获胜 · 全灭" });
  });

  it("publishes each completed round for the final results view", () => {
    expect(buildEliminationRoundHistory(snapshot())).toEqual([{ roundIndex: 4, winnerLabel: "红队", reasonLabel: "全灭", scoreLabel: "存活 2 - 0" }]);
  });
});

function snapshot(options: { ownAlive?: boolean; phase?: "live" | "result" } = {}): GameSnapshot {
  const ownAlive = options.ownAlive ?? true;
  return {
    serverTime: 112_000,
    phase: "playing",
    remainingMs: 18_000,
    overtimePlayerIds: [], winnerIds: [], holderId: null, holdRemainingMs: null, finishedAt: null,
    matchMvpId: null, matchMvpScore: null,
    players: [
      player("red-1", "自己", "red", ownAlive), player("red-2", "红队友", "red", true), player("blue-1", "蓝方", "blue", true),
      player("blue-2", "蓝方二", "blue", false),
    ],
    projectiles: [], energy: [], skillOrbs: [], matchMode: "teamElimination3v3",
    teamScores: [{ teamId: "red", score: 2, targetScore: 4 }, { teamId: "blue", score: 1, targetScore: 4 }],
    elimination: {
      phase: options.phase ?? "live", roundIndex: 4, roundScores: [{ teamId: "red", score: 2, targetScore: 4 }, { teamId: "blue", score: 1, targetScore: 4 }],
      deadline: 130_000, maxScoredRounds: 7, decisive: false,
      rounds: [{ roundIndex: 4, winnerTeamId: "red", reason: "eliminated", redAlive: 2, blueAlive: 0 }],
    },
  };
}

function player(id: string, nickname: string, teamId: "red" | "blue", alive: boolean): GameSnapshot["players"][number] {
  return {
    id, nickname, characterId: "blaze", color: teamId === "red" ? "#f00" : "#00f", isBot: false, connected: true, ready: true,
    x: 100, y: 100, vx: 0, vy: 0, angle: 0, teamId, health: alive ? 100 : 0, maxHealth: 100, damage: 20, moveSpeed: 250,
    fireCooldownMs: 400, projectileSpeed: 600, score: 0, kills: 0, assists: 0, deaths: alive ? 0 : 1, damageDealt: 0, healingDone: 0,
    damageTaken: 0, skillContribution: 0, energyCollected: 0, alive, respawnAt: null, shieldUntil: 0, skillShieldHealth: 0, skillShieldUntil: 0,
    lastProcessedInput: 0, skillSlot: { type: null, charges: 0 }, lastProcessedSkillAction: 0,
  };
}
