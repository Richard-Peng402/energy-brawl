import { describe, expect, it } from "vitest";

import { GameRoom } from "../src/server/room";

describe("team elimination room lifecycle", () => {
  it("starts a three-versus-three round and publishes prep/live state", () => {
    const room = new GameRoom();
    expect(room.setMatchMode("teamElimination3v3")).toEqual({ ok: true });
    room.joinHuman("socket-elimination", { nickname: "歼灭玩家", characterId: "blaze" });
    room.setReady("socket-elimination", true);
    expect(room.startMatch()).toEqual({ ok: true });
    const initial = room.gameSnapshot()!;
    expect(initial.matchMode).toBe("teamElimination3v3");
    expect(initial.elimination).toMatchObject({ phase: "prep", roundIndex: 1 });
    expect(initial.elimination?.roundScores).toEqual(expect.arrayContaining([{ teamId: "red", score: 0, targetScore: 4 }]));

    room.tick(8_000);
    expect(room.gameSnapshot()?.elimination).toMatchObject({ phase: "live", roundIndex: 1 });
  });

  it("scores a round after one team is eliminated and resets the next round", () => {
    const room = new GameRoom();
    room.setMatchMode("teamElimination3v3");
    room.joinHuman("socket-round", { nickname: "回合玩家", characterId: "blaze" });
    room.setReady("socket-round", true);
    room.startMatch();
    room.tick(8_000);

    const world = room.gameWorld()!;
    for (const player of world.players.values()) {
      player.shieldUntil = 0;
      if (player.teamId === "blue") {
        player.alive = false;
        player.health = 0;
      }
    }
    room.tick(1);
    expect(room.gameSnapshot()?.elimination).toMatchObject({ phase: "result", roundIndex: 1 });
    expect(room.gameSnapshot()?.elimination?.roundScores).toEqual(expect.arrayContaining([{ teamId: "red", score: 1, targetScore: 4 }]));

    room.tick(4_000);
    expect(room.gameSnapshot()?.elimination).toMatchObject({ phase: "prep", roundIndex: 2, decisive: false });
    expect([...room.gameWorld()!.players.values()].every((player) => player.alive && player.health === player.maxHealth)).toBe(true);
  });

  it("keeps the host force-winner command on the unified finished path", () => {
    const room = new GameRoom();
    room.setMatchMode("teamElimination3v3");
    const joined = room.joinHuman("socket-force", { nickname: "强制胜者", characterId: "blaze" });
    room.setReady("socket-force", true);
    room.startMatch();
    expect(room.applyHostAdminCommand({ type: "forceWinner", playerId: joined.data!.playerId })).toEqual({ ok: true });
    expect(room.gameSnapshot()?.phase).toBe("finished");
    expect(room.gameSnapshot()?.winnerIds).toContain(joined.data!.playerId);
  });

  it("turns a host health value of zero into an authoritative elimination death", () => {
    const room = new GameRoom();
    room.setMatchMode("teamElimination3v3");
    const joined = room.joinHuman("socket-admin-death", { nickname: "绠＄悊鍛樿瑙夋祴", characterId: "blaze" });
    room.setReady("socket-admin-death", true);
    room.startMatch();
    room.tick(8_000);

    expect(room.applyHostAdminCommand({ type: "setStat", playerId: joined.data!.playerId, stat: "health", value: 0 })).toEqual({ ok: true });
    expect(room.gameSnapshot()?.players.find((player) => player.id === joined.data!.playerId)).toMatchObject({ alive: false, health: 0, deaths: 1 });
  });
});
