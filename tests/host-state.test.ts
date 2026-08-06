import { describe, expect, it } from "vitest";

import type { GameSnapshot, RoomSnapshot } from "../src/shared/protocol";
import { resolveHostPresentation } from "../src/client/host-app";

describe("host presentation state", () => {
  it("uses the live game phase and scores over the stale room snapshot", () => {
    const room: RoomSnapshot = {
      phase: "playing",
      canStart: false,
      players: [
        { id: "player-1", nickname: "玩家", characterId: "blaze", color: "#ff5a5f", isBot: false, connected: true, ready: true, score: 0 },
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
});
