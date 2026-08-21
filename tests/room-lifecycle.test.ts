import { describe, expect, it } from "vitest";

import { GameRoom } from "../src/server/room";

describe("room lifecycle countdown", () => {
  it("keeps a cancellable countdown separate from the combat world", () => {
    const room = new GameRoom();
    expect(room.joinHuman("socket", { nickname: "Alpha", characterId: "blaze" }).ok).toBe(true);
    expect(room.setReady("socket", true)).toEqual({ ok: true });
    expect(room.startMatch({ countdown: true })).toEqual({ ok: true });
    expect(room.snapshot()).toMatchObject({ lifecyclePhase: "countdown", countdownRemainingMs: 5_000 });
    expect(room.gameWorld()).toBeNull();

    expect(room.setReady("socket", false)).toEqual({ ok: true });
    expect(room.snapshot()).toMatchObject({ lifecyclePhase: "lobby", countdownRemainingMs: null });
  });

  it("starts the next countdown when every retained player readies after results", () => {
    const room = new GameRoom();
    room.joinHuman("socket", { nickname: "Alpha", characterId: "blaze" });
    room.setReady("socket", true);
    room.startMatch();
    room.endMatch();
    room.tick(9_000);
    expect(room.snapshot().lifecyclePhase).toBe("roleSelect");
    expect(room.setReady("socket", true)).toEqual({ ok: true });
    expect(room.startMatch({ countdown: true })).toEqual({ ok: true });
    expect(room.snapshot().lifecyclePhase).toBe("countdown");
    room.tick(5_000);
    expect(room.gameWorld()).not.toBeNull();
  });
});
