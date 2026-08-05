import { describe, expect, it } from "vitest";

import { CHARACTER_CATALOG, type CharacterId } from "../src/shared/character-catalog";
import { LOBBY_RETURN_DELAY_MS, RECONNECT_WINDOW_MS } from "../src/shared/constants";
import { GameRoom } from "../src/server/room";

const join = (room: GameRoom, socketId: string, nickname: string, characterId: CharacterId = "blaze") =>
  room.joinHuman(socketId, { nickname, characterId });

describe("game room", () => {
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
