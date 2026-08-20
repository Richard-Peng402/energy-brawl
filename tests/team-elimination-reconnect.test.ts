import { describe, expect, it } from "vitest";
import { GameRoom } from "../src/server/room";

function startedRoom(): { room: GameRoom; playerId: string; token: string } {
  const room = new GameRoom();
  room.setMatchMode("teamElimination3v3");
  const joined = room.joinHuman("socket-1", { nickname: "重连玩家", characterId: "blaze" });
  room.setReady("socket-1", true);
  room.startMatch();
  return { room, playerId: joined.data!.playerId, token: joined.data!.reconnectToken };
}

describe("team elimination reconnect control", () => {
  it("keeps a live-round reconnect bot-controlled until the next prep boundary", () => {
    const { room, playerId, token } = startedRoom();
    room.tick(8_000);
    room.disconnect("socket-1");

    expect(room.reconnectHuman("socket-2", token)).toMatchObject({ ok: true, data: { playerId } });
    expect(room.gameSnapshot()?.players.find((player) => player.id === playerId)).toMatchObject({ connected: true, isBot: true });
    expect(room.handleInput("socket-2", { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: true })).toBe(false);

    const ownTeam = room.gameWorld()!.players.get(playerId)!.teamId;
    for (const player of room.gameWorld()!.players.values()) {
      if (player.teamId !== ownTeam) { player.alive = false; player.health = 0; }
    }
    room.tick(1);
    expect(room.gameSnapshot()?.elimination?.phase).toBe("result");
    room.tick(4_000);

    expect(room.gameSnapshot()?.elimination).toMatchObject({ phase: "prep", roundIndex: 2 });
    expect(room.gameSnapshot()?.players.find((player) => player.id === playerId)).toMatchObject({ connected: true, isBot: false, vx: 0, vy: 0 });
    expect(room.handleInput("socket-2", { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false })).toBe(true);
  });

  it("restores control immediately when reconnecting during prep", () => {
    const { room, playerId, token } = startedRoom();
    room.disconnect("socket-1");
    expect(room.reconnectHuman("socket-2", token).ok).toBe(true);
    expect(room.gameSnapshot()?.players.find((player) => player.id === playerId)).toMatchObject({ connected: true, isBot: false });
    expect(room.handleInput("socket-2", { seq: 1, moveX: 0, moveY: 1, aimX: 0, aimY: 1, firing: false })).toBe(true);
  });
});
