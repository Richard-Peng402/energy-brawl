import { describe, expect, it } from "vitest";

import type { GameSnapshot, RoomSnapshot } from "../src/shared/protocol";
import { canEditLobbyRules, canUseHostAdmin, resolveHostPresentation } from "../src/client/host-app";

describe("host presentation state", () => {
  it("enables host admin tools in the lobby but not after a match finishes", () => {
    expect(canUseHostAdmin("lobby", "secret")).toBe(true);
    expect(canUseHostAdmin("playing", "secret")).toBe(true);
    expect(canUseHostAdmin("finished", "secret")).toBe(false);
    expect(canUseHostAdmin("lobby", "")).toBe(false);
  });

  it("uses the live game phase and scores over the stale room snapshot", () => {
    const room: RoomSnapshot = {
      phase: "playing",
      canStart: false,
      pendingWinnerId: null,
      players: [
        { id: "player-1", nickname: "玩家", characterId: "blaze", color: "#ff5a5f", isBot: false, connected: true, ready: true, teamId: null, health: 100, maxHealth: 100, damage: 27, moveSpeed: 265, fireCooldownMs: 450, projectileSpeed: 620, score: 0, kills: 0, energyCollected: 0 },
      ],
    };
    const game: GameSnapshot = {
      serverTime: 1_000,
      phase: "finished",
      remainingMs: 200_000,
      overtimePlayerIds: [],
      winnerIds: ["player-1"],
      holderId: null,
      holdRemainingMs: null,
      finishedAt: 1_000,
      players: [
        {
          ...room.players[0]!,
          x: 100,
          y: 100,
          vx: 0,
          vy: 0,
          angle: 0,
          health: 100,
          maxHealth: 100,
          damage: 27,
          moveSpeed: 265,
          fireCooldownMs: 450,
          projectileSpeed: 620,
          kills: 4,
          energyCollected: 3,
          alive: true,
          respawnAt: null,
          shieldUntil: 0,
          skillShieldHealth: 0,
          skillShieldUntil: 0,
          lastProcessedInput: 0,
          skillSlot: { type: null, charges: 0 },
          lastProcessedSkillAction: 0,
          score: 15,
        },
      ],
      projectiles: [],
      energy: [],
      skillOrbs: [],
    };

    const presentation = resolveHostPresentation(room, game);

    expect(presentation.phase).toBe("finished");
    expect(presentation.players[0]?.score).toBe(15);
  });

  it("exposes confirmed mode and team scores while locking lobby rules after start", () => {
    const room: RoomSnapshot = {
      phase: "lobby", canStart: false, pendingWinnerId: null, matchMode: "team3v3",
      teamScores: [{ teamId: "red", score: 0, targetScore: 60 }], players: [],
    };
    expect(resolveHostPresentation(room, null)).toMatchObject({
      matchMode: "team3v3",
      teamScores: [{ teamId: "red", score: 0, targetScore: 60 }],
    });
    expect(canEditLobbyRules("lobby", "secret")).toBe(true);
    expect(canEditLobbyRules("playing", "secret")).toBe(false);
    expect(canEditLobbyRules("lobby", "")).toBe(false);
  });
});
