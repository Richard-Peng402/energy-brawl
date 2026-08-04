import { describe, expect, it } from "vitest";

import { PLAYER_COLORS, RECONNECT_WINDOW_MS } from "../src/shared/constants";
import { GameRoom } from "../src/server/room";

describe("game room", () => {
  it("fills all empty seats with bots on start", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket-1", { nickname: "玩家一", color: PLAYER_COLORS[0] });
    expect(joined.ok).toBe(true);
    expect(room.setReady("socket-1", true).ok).toBe(true);

    expect(room.startMatch().ok).toBe(true);

    const snapshot = room.snapshot();
    expect(snapshot.players).toHaveLength(6);
    expect(snapshot.players.filter((player) => player.isBot)).toHaveLength(5);
  });

  it("lets a disconnected human reclaim the same seat", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket-1", { nickname: "玩家一", color: PLAYER_COLORS[0] });
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
    });
  });

  it("expires reconnect ownership after thirty seconds", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket-1", { nickname: "玩家一", color: PLAYER_COLORS[0] });
    const token = joined.data!.reconnectToken;
    room.setReady("socket-1", true);
    room.startMatch();
    room.disconnect("socket-1");

    room.tick(RECONNECT_WINDOW_MS + 1);

    expect(room.reconnectHuman("socket-2", token).ok).toBe(false);
  });

  it("resets the accepted input sequence when a human reconnects", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket-1", { nickname: "玩家一", color: PLAYER_COLORS[0] });
    room.setReady("socket-1", true);
    room.startMatch();
    room.handleInput("socket-1", { seq: 900, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false });
    room.disconnect("socket-1");

    room.reconnectHuman("socket-2", joined.data!.reconnectToken);

    expect(room.gameSnapshot()?.players.find((player) => player.id === joined.data!.playerId)?.lastProcessedInput).toBe(0);
    expect(room.handleInput("socket-2", { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false })).toBe(true);
  });

  it("removes expired disconnected seats from the lobby", () => {
    const room = new GameRoom();
    PLAYER_COLORS.forEach((color, index) => {
      room.joinHuman(`socket-${index}`, { nickname: `玩家${index}`, color });
      room.disconnect(`socket-${index}`);
    });

    room.tick(RECONNECT_WINDOW_MS + 1);

    expect(room.snapshot().players).toHaveLength(0);
    expect(room.joinHuman("new-socket", { nickname: "新玩家", color: PLAYER_COLORS[0] }).ok).toBe(true);
  });

  it("returns to an empty lobby when every human misses the reconnect window", () => {
    const room = new GameRoom();
    room.joinHuman("socket-1", { nickname: "玩家一", color: PLAYER_COLORS[0] });
    room.setReady("socket-1", true);
    room.startMatch();
    room.disconnect("socket-1");

    room.tick(RECONNECT_WINDOW_MS + 1);

    expect(room.snapshot()).toMatchObject({ phase: "lobby", players: [] });
  });

  it("records the finish time when the host ends a match", () => {
    const room = new GameRoom();
    room.joinHuman("socket-1", { nickname: "Host", color: PLAYER_COLORS[0] });
    room.setReady("socket-1", true);
    room.startMatch();
    room.tick(1_000);

    room.endMatch();

    expect(room.gameSnapshot()).toMatchObject({ phase: "finished", finishedAt: 1_000 });
  });

  it("keeps a finished result immutable when the host ends twice", () => {
    const room = new GameRoom();
    room.joinHuman("socket-1", { nickname: "Host", color: PLAYER_COLORS[0] });
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
    room.joinHuman("socket-1", { nickname: "Host", color: PLAYER_COLORS[0] });
    room.setReady("socket-1", true);
    room.startMatch();
    room.tick(960_000);

    expect(room.endMatch().ok).toBe(true);

    const snapshot = room.gameSnapshot()!;
    expect(snapshot.finishedAt).toBe(snapshot.serverTime);
  });
});
