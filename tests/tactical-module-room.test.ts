import { describe, expect, it } from "vitest";

import { GameRoom } from "../src/server/room";

describe("tactical module room selection", () => {
  it("changes a valid module before ready and rejects changes after ready", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket", {
      nickname: "测试",
      characterId: "blaze",
      tacticalModuleId: "shield-reinforcement",
    });

    expect(joined.ok).toBe(true);
    expect(room.changeTacticalModule("socket", "ballistic-acceleration")).toEqual({ ok: true });
    expect(room.setReady("socket", true)).toEqual({ ok: true });
    expect(room.changeTacticalModule("socket", "cooldown-converter")).toMatchObject({ ok: false });
    expect(room.snapshot().players[0]!.tacticalModuleId).toBe("ballistic-acceleration");
  });

  it("uses the character recommendation when an older client omits the module", () => {
    const room = new GameRoom();
    expect(room.joinHuman("socket", { nickname: "旧客户端", characterId: "medic" }).ok).toBe(true);
    expect(room.snapshot().players[0]!.tacticalModuleId).toBe("healing-amplifier");
  });

  it("restores the same module after disconnect and reconnect", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket-a", {
      nickname: "测试",
      characterId: "phase",
      tacticalModuleId: "cooldown-converter",
    });
    expect(joined.ok).toBe(true);

    room.disconnect("socket-a");
    expect(room.reconnectHuman("socket-b", joined.data!.reconnectToken).ok).toBe(true);
    expect(room.snapshot().players[0]!.tacticalModuleId).toBe("cooldown-converter");
  });

  it("rejects an invalid module without mutating the seat", () => {
    const room = new GameRoom();
    room.joinHuman("socket", { nickname: "测试", characterId: "runner" });
    const before = room.snapshot().players[0]!.tacticalModuleId;
    expect(room.changeTacticalModule("socket", "damage-boost" as never)).toMatchObject({ ok: false });
    expect(room.snapshot().players[0]!.tacticalModuleId).toBe(before);
  });
});
