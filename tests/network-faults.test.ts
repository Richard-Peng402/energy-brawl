import { describe, expect, it } from "vitest";

import { createFaultSchedule } from "./helpers/fault-injected-transport";
import { GameRoom } from "../src/server/room";

describe("deterministic network faults", () => {
  it("reproduces the same loss, jitter, and reordering schedule with the same seed", () => {
    const options = { seed: 42, packetLoss: 0.12, minDelayMs: 30, maxDelayMs: 180 };
    const first = createFaultSchedule(options, 100);
    const second = createFaultSchedule(options, 100);

    expect(first).toEqual(second);
    expect(first.some((entry) => entry.dropped)).toBe(true);
    expect(first.some((entry, index) => index > 0 && entry.deliverAt < first[index - 1]!.deliverAt)).toBe(true);
  });

  it("clears a queued exclusive skill when a player disconnects and reconnects", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket-a", { nickname: "测试", characterId: "blaze" });
    expect(joined.ok).toBe(true);
    room.setReady("socket-a", true);
    room.startMatch();
    expect(room.handleExclusiveSkillAction("socket-a", { skillActionSeq: 1, directionX: 1, directionY: 0 })).toBe(true);

    room.disconnect("socket-a");
    expect(room.reconnectHuman("socket-b", joined.data!.reconnectToken)).toEqual({ ok: true, data: joined.data });
    room.tick(16);

    expect(room.gameSnapshot()?.exclusiveSkillEvents?.some((event) => event.playerId === joined.data!.playerId && event.stage === "cast")).toBe(false);
  });
});
