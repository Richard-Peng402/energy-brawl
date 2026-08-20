import { describe, expect, it } from "vitest";
import { GameRoom } from "../src/server/room";

describe("player handover", () => {
  it("emits bot takeover and human restoration without replacing the player identity", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket-a", { nickname: "Alice", characterId: "blaze" });
    expect(joined.ok).toBe(true);
    room.setReady("socket-a", true);
    expect(room.startMatch()).toEqual({ ok: true });
    const playerId = joined.data!.playerId;
    const token = joined.data!.reconnectToken;

    room.disconnect("socket-a");
    expect(room.consumeHandoverEvents()).toEqual([{ playerId, controlOwner: "bot", serverTime: 0 }]);
    expect(room.reconnectHuman("socket-b", token)).toMatchObject({ ok: true, data: { playerId } });
    expect(room.consumeHandoverEvents()).toEqual([{ playerId, controlOwner: "human", serverTime: 0 }]);
  });
});
