import { describe, expect, it } from "vitest";

import { CHARACTER_CATALOG, getCharacter, type CharacterId } from "../src/shared/character-catalog";
import { LOBBY_RETURN_DELAY_MS, RECONNECT_WINDOW_MS, SKILL_ORB_SPAWN_MIN_MS } from "../src/shared/constants";
import { GameRoom } from "../src/server/room";
import { collectWorldSkillOrb, type GameWorld } from "../src/server/simulation";

const join = (room: GameRoom, socketId: string, nickname: string, characterId: CharacterId = "blaze") =>
  room.joinHuman(socketId, { nickname, characterId });

describe("game room", () => {
  it("applies lobby stat changes, kicks seats, and presets the next winner synchronously", () => {
    const room = new GameRoom();
    const first = join(room, "socket-admin-1", "属性目标", "blaze");
    const second = join(room, "socket-admin-2", "预设胜者", "medic");
    const apply = (command: Parameters<GameRoom["applyHostAdminCommand"]>[0]) => room.applyHostAdminCommand(command);

    expect(apply({ type: "setStat", playerId: first.data!.playerId, stat: "health", value: 180 })).toEqual({ ok: true });
    expect(apply({ type: "setStat", playerId: first.data!.playerId, stat: "damage", value: 80 })).toEqual({ ok: true });
    expect(apply({ type: "setStat", playerId: first.data!.playerId, stat: "projectileSpeed", value: 1_200 })).toEqual({ ok: true });
    expect(apply({ type: "setStat", playerId: first.data!.playerId, stat: "kills", value: 8 })).toEqual({ ok: true });
    expect(apply({ type: "setStat", playerId: first.data!.playerId, stat: "energyCollected", value: 12 })).toEqual({ ok: true });
    expect(room.snapshot().players.find((player) => player.id === first.data!.playerId)).toMatchObject({
      health: 180,
      maxHealth: 180,
      damage: 80,
      projectileSpeed: 1_200,
      kills: 8,
      energyCollected: 12,
    });

    expect(apply({ type: "kick", playerId: first.data!.playerId })).toEqual({ ok: true });
    expect(room.snapshot().players.some((player) => player.id === first.data!.playerId)).toBe(false);
    expect(room.consumeKickedSocketIds()).toEqual(["socket-admin-1"]);

    expect(apply({ type: "forceWinner", playerId: second.data!.playerId })).toEqual({ ok: true });
    expect(room.snapshot().pendingWinnerId).toBe(second.data!.playerId);
    room.setReady("socket-admin-2", true);
    expect(room.startMatch().ok).toBe(true);
    expect(room.gameSnapshot()).toMatchObject({ phase: "finished", winnerIds: [second.data!.playerId] });
  });

  it("restarts the out-of-combat timer when the host lowers current health", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-regen-admin", "回血目标", "blaze");
    room.setReady("socket-regen-admin", true);
    room.startMatch();
    room.tick(10_000);

    expect(room.applyHostAdminCommand({ type: "setStat", playerId: joined.data!.playerId, stat: "health", value: 50 })).toEqual({ ok: true });
    room.tick(1_000);

    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)?.health).toBe(50);
  });

  it("exposes editable character stats while players are still in the lobby", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-preview", "大厅预览", "fortress");
    const fortress = getCharacter("fortress");

    expect(room.snapshot()).toMatchObject({
      phase: "lobby",
      pendingWinnerId: null,
      players: [
        {
          id: joined.data!.playerId,
          health: fortress.maxHealth,
          maxHealth: fortress.maxHealth,
          damage: fortress.damage,
          score: 0,
          moveSpeed: fortress.moveSpeed,
          fireCooldownMs: fortress.fireCooldownMs,
          projectileSpeed: fortress.projectileSpeed,
          kills: 0,
          energyCollected: 0,
        },
      ],
    });
  });

  it("allows a seated human to switch to another character before readying up", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-switch", "换角玩家", "blaze");
    const fortress = getCharacter("fortress");

    expect(room.changeCharacter("socket-switch", "fortress")).toEqual({ ok: true });
    expect(room.snapshot().players[0]).toMatchObject({
      id: joined.data!.playerId,
      characterId: "fortress",
      health: fortress.maxHealth,
      damage: fortress.damage,
      moveSpeed: fortress.moveSpeed,
    });

    expect(room.setReady("socket-switch", true)).toEqual({ ok: true });
    expect(room.changeCharacter("socket-switch", "medic")).toMatchObject({ ok: false });
    expect(room.snapshot().players[0]?.characterId).toBe("fortress");
  });

  it("kicks a human into an AI seat and invalidates its reconnect token for the current match", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "Target");
    room.setReady("socket-1", true);
    room.startMatch();
    expect(room.applyHostAdminCommand({ type: "kick", playerId: joined.data!.playerId })).toEqual({ ok: true });

    const player = room.gameSnapshot()!.players.find((candidate) => candidate.id === joined.data!.playerId)!;
    expect(player).toMatchObject({ isBot: true, connected: false, skillSlot: { type: null, charges: 0 } });
    expect(room.reconnectHuman("socket-2", joined.data!.reconnectToken).ok).toBe(false);
    expect(room.consumeKickedSocketIds()).toEqual(["socket-1"]);
    expect(room.consumeKickedSocketIds()).toEqual([]);
  });

  it("forces a selected player to win through the normal finished transition", () => {
    const room = new GameRoom();
    const first = join(room, "socket-1", "Winner");
    room.setReady("socket-1", true);
    room.startMatch();
    expect(room.applyHostAdminCommand({ type: "forceWinner", playerId: first.data!.playerId })).toEqual({ ok: true });
    expect(room.gameSnapshot()).toMatchObject({ phase: "finished", winnerIds: [first.data!.playerId], finishedAt: 0 });
    expect(room.tick(LOBBY_RETURN_DELAY_MS)).toBe(true);
    expect(room.snapshot().phase).toBe("lobby");
  });
  it("queues monotonic skill actions until the simulation tick", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "Player");
    room.setReady("socket-1", true);
    room.startMatch();

    expect(room.handleSkillAction("socket-1", { skillActionSeq: 1 })).toBe(true);
    expect(room.handleSkillAction("socket-1", { skillActionSeq: 1 })).toBe(false);
    expect(room.handleSkillAction("socket-1", { skillActionSeq: Number.NaN })).toBe(false);
    expect(room.handleSkillAction("socket-1", { skillActionSeq: 1_000_000 })).toBe(false);
    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)!.lastProcessedSkillAction).toBe(0);

    room.tick(16);

    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)!.lastProcessedSkillAction).toBe(1);
  });

  it("preserves a collected skill on reconnect but clears it after bot takeover", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "技能玩家", "blaze");
    join(room, "socket-2", "留守玩家", "medic");
    room.setReady("socket-1", true);
    room.setReady("socket-2", true);
    room.startMatch();
    room.tick(SKILL_ORB_SPAWN_MIN_MS);
    const orb = room.gameSnapshot()!.skillOrbs[0]!;
    const world = (room as unknown as { world: GameWorld }).world;
    expect(collectWorldSkillOrb(world, joined.data!.playerId, orb.id)).toBe(true);
    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)!.skillSlot.charges).toBe(1);

    room.disconnect("socket-1");
    expect(room.reconnectHuman("socket-3", joined.data!.reconnectToken).ok).toBe(true);
    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)!.skillSlot.charges).toBe(1);

    room.disconnect("socket-3");
    room.tick(RECONNECT_WINDOW_MS + 1);
    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)).toMatchObject({
      isBot: true,
      skillSlot: { type: null, charges: 0 },
    });
  });

  it("fills all empty seats with bots on start", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "玩家一");
    expect(joined.ok).toBe(true);
    expect(room.setReady("socket-1", true).ok).toBe(true);

    expect(room.startMatch().ok).toBe(true);

    const snapshot = room.snapshot();
    expect(snapshot.players).toHaveLength(6);
    expect(snapshot.players.filter((player) => player.isBot)).toHaveLength(5);
  });

  it("gives bots at least five hundred milliseconds between decisions", () => {
    const room = new GameRoom();
    join(room, "socket-think", "节奏玩家");
    room.setReady("socket-think", true);
    room.startMatch();

    room.tick(16);

    const nextThinkTimes = [...(room as unknown as { nextBotThinkAt: Map<string, number> }).nextBotThinkAt.values()];
    expect(nextThinkTimes).toHaveLength(5);
    expect(Math.min(...nextThinkTimes)).toBeGreaterThanOrEqual(516);
  });

  it("lets a disconnected human reclaim the same seat", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "玩家一", "medic");
    const token = joined.data!.reconnectToken;
    const playerId = joined.data!.playerId;
    room.setReady("socket-1", true);
    room.startMatch();

    room.disconnect("socket-1");
    expect(room.gameSnapshot()?.players.find((player) => player.id === playerId)).toMatchObject({
      connected: false,
      isBot: true,
    });

    const reconnected = room.reconnectHuman("socket-2", token);
    expect(reconnected).toMatchObject({ ok: true, data: { playerId } });
    expect(room.gameSnapshot()?.players.find((player) => player.id === playerId)).toMatchObject({
      connected: true,
      isBot: false,
      characterId: "medic",
    });
  });

  it("expires reconnect ownership after thirty seconds", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "玩家一");
    const token = joined.data!.reconnectToken;
    room.setReady("socket-1", true);
    room.startMatch();
    room.disconnect("socket-1");

    room.tick(RECONNECT_WINDOW_MS + 1);

    expect(room.reconnectHuman("socket-2", token).ok).toBe(false);
  });

  it("resets the accepted input sequence when a human reconnects", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "玩家一");
    room.setReady("socket-1", true);
    room.startMatch();
    room.handleInput("socket-1", { seq: 900, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false });
    room.disconnect("socket-1");

    room.reconnectHuman("socket-2", joined.data!.reconnectToken);

    expect(room.gameSnapshot()?.players.find((player) => player.id === joined.data!.playerId)?.lastProcessedInput).toBe(0);
    expect(room.handleInput("socket-2", { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false })).toBe(true);
  });

  it("applies only the highest-sequence input once at the next simulation tick", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "Player");
    room.setReady("socket-1", true);
    room.startMatch();

    expect(room.handleInput("socket-1", { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false })).toBe(true);
    expect(room.handleInput("socket-1", { seq: 1.5, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false })).toBe(false);
    expect(room.handleInput("socket-1", { seq: 3, moveX: 0, moveY: 1, aimX: 0, aimY: 1, firing: false })).toBe(true);
    expect(room.handleInput("socket-1", { seq: 2, moveX: -1, moveY: 0, aimX: -1, aimY: 0, firing: false })).toBe(false);
    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)!.lastProcessedInput).toBe(0);

    room.tick(16);

    const player = room.gameSnapshot()!.players.find((candidate) => candidate.id === joined.data!.playerId)!;
    expect(player.lastProcessedInput).toBe(3);
    expect(player.vy).toBeGreaterThan(0);
  });

  it("drops queued input when a player disconnects and reconnects", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "Player");
    room.setReady("socket-1", true);
    room.startMatch();
    room.handleInput("socket-1", { seq: 99, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false });

    room.disconnect("socket-1");
    room.reconnectHuman("socket-2", joined.data!.reconnectToken);
    room.tick(16);

    const player = room.gameSnapshot()!.players.find((candidate) => candidate.id === joined.data!.playerId)!;
    expect(player.lastProcessedInput).toBe(0);
    expect(player.vx).toBe(0);
  });

  it("does not carry queued input into a new match after reset", () => {
    const room = new GameRoom();
    const joined = join(room, "socket-1", "Player");
    room.setReady("socket-1", true);
    room.startMatch();
    room.handleInput("socket-1", { seq: 99, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false });

    room.endMatch();
    room.resetToLobby();
    room.setReady("socket-1", true);
    room.startMatch();
    room.tick(16);

    const player = room.gameSnapshot()!.players.find((candidate) => candidate.id === joined.data!.playerId)!;
    expect(player.lastProcessedInput).toBe(0);
    expect(player.vx).toBe(0);
  });

  it("removes expired disconnected seats from the lobby", () => {
    const room = new GameRoom();
    CHARACTER_CATALOG.forEach((character, index) => {
      room.joinHuman(`socket-${index}`, { nickname: `玩家${index}`, characterId: character.id });
      room.disconnect(`socket-${index}`);
    });

    room.tick(RECONNECT_WINDOW_MS + 1);

    expect(room.snapshot().players).toHaveLength(0);
    expect(join(room, "new-socket", "新玩家").ok).toBe(true);
  });

  it("returns to an empty lobby when every human misses the reconnect window", () => {
    const room = new GameRoom();
    join(room, "socket-1", "玩家一");
    room.setReady("socket-1", true);
    room.startMatch();
    room.disconnect("socket-1");

    room.tick(RECONNECT_WINDOW_MS + 1);

    expect(room.snapshot()).toMatchObject({ phase: "lobby", players: [] });
  });

  it("records the finish time when the host ends a match", () => {
    const room = new GameRoom();
    join(room, "socket-1", "Host");
    room.setReady("socket-1", true);
    room.startMatch();
    room.tick(1_000);

    room.endMatch();

    expect(room.gameSnapshot()).toMatchObject({ phase: "finished", finishedAt: 1_000 });
  });

  it("keeps a finished result immutable when the host ends twice", () => {
    const room = new GameRoom();
    join(room, "socket-1", "Host");
    room.setReady("socket-1", true);
    room.startMatch();
    room.tick(1_000);
    room.endMatch();
    const firstFinish = room.gameSnapshot();
    room.tick(1_000);

    expect(room.endMatch().ok).toBe(false);
    expect(room.gameSnapshot()).toMatchObject({
      winnerIds: firstFinish!.winnerIds,
      finishedAt: firstFinish!.finishedAt,
    });
  });

  it("uses the snapshot server time for a manual finish after clock drift", () => {
    const room = new GameRoom();
    join(room, "socket-1", "Host");
    room.setReady("socket-1", true);
    room.startMatch();
    room.tick(960_000);

    expect(room.endMatch().ok).toBe(true);

    const snapshot = room.gameSnapshot()!;
    expect(snapshot.finishedAt).toBe(snapshot.serverTime);
  });

  it("automatically returns a finished match to the lobby after eight seconds", () => {
    const room = new GameRoom();
    join(room, "socket-1", "Host");
    room.setReady("socket-1", true);
    room.startMatch();
    room.endMatch();

    expect(room.tick(LOBBY_RETURN_DELAY_MS - 1)).toBe(false);
    expect(room.snapshot().phase).toBe("finished");
    expect(room.tick(1)).toBe(true);
    expect(room.snapshot()).toMatchObject({
      phase: "lobby",
      players: [{ nickname: "Host", connected: true, ready: false, isBot: false }],
    });
  });

  it("allows only a connected seated human to return a finished match early", () => {
    const room = new GameRoom();
    join(room, "socket-1", "Host");
    room.setReady("socket-1", true);
    room.startMatch();

    expect(room.returnToLobby("socket-1").ok).toBe(false);
    room.endMatch();
    expect(room.returnToLobby("spectator").ok).toBe(false);
    expect(room.returnToLobby("socket-1").ok).toBe(true);
    expect(room.snapshot()).toMatchObject({ phase: "lobby", players: [{ nickname: "Host", ready: false }] });
  });

  it("derives colors from character ids and rejects duplicate human characters", () => {
    const room = new GameRoom();

    expect(join(room, "socket-1", "先锋", "blaze").ok).toBe(true);
    expect(join(room, "socket-2", "复制者", "blaze")).toMatchObject({ ok: false });
    expect(room.snapshot().players[0]).toMatchObject({
      characterId: "blaze",
      color: CHARACTER_CATALOG[0]!.color,
    });
  });

  it("fills bots only with characters not selected by humans", () => {
    const room = new GameRoom();
    join(room, "socket-1", "玩家一", "phase");
    room.setReady("socket-1", true);
    room.startMatch();

    const players = room.gameSnapshot()!.players;
    expect(new Set(players.map((player) => player.characterId)).size).toBe(6);
    expect(players.find((player) => !player.isBot)?.characterId).toBe("phase");
  });
});
