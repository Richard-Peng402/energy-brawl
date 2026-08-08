import { describe, expect, it } from "vitest";

import { gameLeaderboardRevision, roomUiRevision } from "../src/client/render-throttle";
import type { GameSnapshot, RoomSnapshot } from "../src/shared/protocol";

const room = (score = 0): RoomSnapshot => ({
  phase: "lobby",
  canStart: false,
  pendingWinnerId: null,
  players: [{
    id: "player-1",
    nickname: "玩家",
    characterId: "blaze",
    color: "#ff5a5f",
    isBot: false,
    connected: true,
    ready: false,
    health: 94,
    maxHealth: 94,
    damage: 27,
    score,
    moveSpeed: 265,
    fireCooldownMs: 450,
    projectileSpeed: 620,
    kills: 0,
    energyCollected: 0,
  }],
});

const game = (score = 0): GameSnapshot => ({
  serverTime: 100,
  phase: "playing",
  remainingMs: 1000,
  overtimePlayerIds: [],
  winnerIds: [],
  holderId: null,
  holdRemainingMs: null,
  finishedAt: null,
  players: [{
    id: "player-1",
    nickname: "玩家",
    characterId: "blaze",
    color: "#ff5a5f",
    isBot: false,
    connected: true,
    ready: true,
    x: 1,
    y: 2,
    vx: 0,
    vy: 0,
    angle: 0,
    health: 94,
    maxHealth: 94,
    damage: 27,
    moveSpeed: 265,
    fireCooldownMs: 450,
    projectileSpeed: 620,
    score,
    kills: 0,
    energyCollected: 0,
    alive: true,
    respawnAt: null,
    shieldUntil: 0,
    skillShieldHealth: 0,
    skillShieldUntil: 0,
    lastProcessedInput: 0,
    skillSlot: { type: null, charges: 0 },
    lastProcessedSkillAction: 0,
  }],
  projectiles: [],
  energy: [],
  skillOrbs: [],
});

describe("mobile render throttling", () => {
  it("keeps the room UI revision stable across game snapshots", () => {
    expect(roomUiRevision(room())).toBe(roomUiRevision(room()));
    expect(roomUiRevision(room())).not.toBe(roomUiRevision({ ...room(), players: [{ ...room().players[0]!, ready: true }] }));
  });

  it("changes the leaderboard revision only when visible ranking data changes", () => {
    expect(gameLeaderboardRevision(game(), "player-1")).toBe(gameLeaderboardRevision({ ...game(), serverTime: 200 }, "player-1"));
    expect(gameLeaderboardRevision(game(), "player-1")).not.toBe(gameLeaderboardRevision(game(1), "player-1"));
  });
});
