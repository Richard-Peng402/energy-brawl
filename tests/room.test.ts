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
});
