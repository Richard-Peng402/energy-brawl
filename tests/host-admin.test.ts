import { describe, expect, it } from "vitest";

import { TARGET_SCORE } from "../src/shared/constants";
import type { HostAdminCommand } from "../src/shared/protocol";
import { HostAdminService } from "../src/server/host-admin";
import { createGameWorld } from "../src/server/simulation";

function world() {
  return createGameWorld([
    { id: "player-1", nickname: "玩家", characterId: "blaze", isBot: false },
    { id: "bot-1", nickname: "AI", characterId: "medic", isBot: true },
  ]);
}

const setScore = (value: number): HostAdminCommand => ({ type: "setStat", playerId: "player-1", stat: "score", value });

describe("secure host admin queue", () => {
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("accepts a valid command from loopback %s", (remoteAddress) => {
    const service = new HostAdminService("secret", () => 1_000);
    const game = world();
    expect(service.enqueue({ remoteAddress, token: "secret", command: setScore(7) }, game).ok).toBe(true);
    expect(game.players.get("player-1")!.score).toBe(0);
    expect(service.drain(game)).toEqual({ processed: 1, changed: true });
    expect(game.players.get("player-1")!.score).toBe(7);
  });

  it("rejects LAN callers, wrong tokens, invalid targets, phases, values, and queue overflow", () => {
    const service = new HostAdminService("secret");
    const game = world();
    expect(service.enqueue({ remoteAddress: "192.168.1.20", token: "secret", command: setScore(7) }, game).ok).toBe(false);
    expect(service.enqueue({ remoteAddress: "127.0.0.1", token: "wrong", command: setScore(7) }, game).ok).toBe(false);
    expect(service.enqueue({ remoteAddress: "127.0.0.1", token: "secret", command: { ...setScore(7), playerId: "missing" } }, game).ok).toBe(false);
    expect(service.enqueue({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(100) }, game).ok).toBe(false);
    game.phase = "finished";
    expect(service.enqueue({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(7) }, game).ok).toBe(false);

    const queueService = new HostAdminService("secret");
    const queueWorld = world();
    for (let index = 0; index < 128; index += 1) {
      expect(queueService.enqueue({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(index % 15) }, queueWorld).ok).toBe(true);
    }
    expect(queueService.enqueue({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(1) }, queueWorld).ok).toBe(false);
  });

  it("applies bounded stat changes, lowers health with max health, and keeps the latest two hundred logs", () => {
    let time = 0;
    const service = new HostAdminService("secret", () => ++time);
    const game = world();
    const player = game.players.get("player-1")!;
    player.health = 90;
    const commands: HostAdminCommand[] = [
      { type: "setStat", playerId: player.id, stat: "maxHealth", value: 60 },
      { type: "setStat", playerId: player.id, stat: "damage", value: 80 },
      { type: "setStat", playerId: player.id, stat: "moveSpeed", value: 500 },
      { type: "setStat", playerId: player.id, stat: "fireCooldownMs", value: 100 },
      setScore(TARGET_SCORE),
    ];
    for (const command of commands) expect(service.enqueue({ remoteAddress: "::1", token: "secret", command }, game).ok).toBe(true);
    expect(service.drain(game)).toEqual({ processed: commands.length, changed: true });
    expect(player).toMatchObject({ maxHealth: 60, health: 60, damage: 80, moveSpeed: 500, fireCooldownMs: 100, score: TARGET_SCORE });
    expect(game.holderId).toBe(player.id);

    for (let index = 0; index < 205; index += 1) {
      service.enqueue({ remoteAddress: "127.0.0.1", token: "bad", command: setScore(1) }, game);
    }
    expect(service.getLogs()).toHaveLength(200);
    expect(service.getLogs().at(-1)).toMatchObject({ result: "rejected" });
  });

  it("reports whether a queued command changed authoritative state", () => {
    const service = new HostAdminService("secret");
    const game = world();
    expect(service.enqueue({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(7) }, game).ok).toBe(true);
    expect(service.drain(game)).toEqual({ processed: 1, changed: true });
    expect(service.enqueue({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(7) }, game).ok).toBe(true);
    expect(service.drain(game)).toEqual({ processed: 1, changed: false });
  });

  it("raises max health when the host sets current health above the old maximum", () => {
    const service = new HostAdminService("secret");
    const game = world();
    const player = game.players.get("player-1")!;
    expect(service.enqueue({
      remoteAddress: "127.0.0.1",
      token: "secret",
      command: { type: "setStat", playerId: player.id, stat: "health", value: 180 },
    }, game).ok).toBe(true);

    service.drain(game);

    expect(player).toMatchObject({ health: 180, maxHealth: 180 });
  });
});
