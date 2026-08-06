import { describe, expect, it } from "vitest";

import type { HostAdminCommand } from "../src/shared/protocol";
import { HostAdminService } from "../src/server/host-admin";

const setScore = (value: number): HostAdminCommand => ({ type: "setStat", playerId: "player-1", stat: "score", value });

describe("secure host admin authorization", () => {
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("authorizes lobby commands from loopback %s", (remoteAddress) => {
    const service = new HostAdminService("secret", () => 1_000);

    expect(service.authorize({ remoteAddress, token: "secret", command: setScore(7) }, "lobby", true)).toEqual({ ok: true });
  });

  it("rejects LAN callers, wrong tokens, missing players, finished games, and invalid values", () => {
    const service = new HostAdminService("secret");

    expect(service.authorize({ remoteAddress: "192.168.1.20", token: "secret", command: setScore(7) }, "lobby", true).ok).toBe(false);
    expect(service.authorize({ remoteAddress: "127.0.0.1", token: "wrong", command: setScore(7) }, "lobby", true).ok).toBe(false);
    expect(service.authorize({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(7) }, "lobby", false).ok).toBe(false);
    expect(service.authorize({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(7) }, "finished", true).ok).toBe(false);
    expect(service.authorize({ remoteAddress: "127.0.0.1", token: "secret", command: setScore(100) }, "playing", true).ok).toBe(false);
  });

  it("enforces every editable stat range", () => {
    const service = new HostAdminService("secret");
    const commands: HostAdminCommand[] = [
      { type: "setStat", playerId: "player-1", stat: "health", value: 500 },
      { type: "setStat", playerId: "player-1", stat: "maxHealth", value: 1 },
      { type: "setStat", playerId: "player-1", stat: "damage", value: 200 },
      { type: "setStat", playerId: "player-1", stat: "score", value: 99 },
      { type: "setStat", playerId: "player-1", stat: "moveSpeed", value: 600 },
      { type: "setStat", playerId: "player-1", stat: "fireCooldownMs", value: 100 },
    ];

    for (const command of commands) {
      expect(service.authorize({ remoteAddress: "::1", token: "secret", command }, "playing", true)).toEqual({ ok: true });
    }
  });

  it("records applied and rejected results while retaining only the latest two hundred logs", () => {
    let time = 0;
    const service = new HostAdminService("secret", () => ++time);
    const command = setScore(7);
    service.recordResult(command, { ok: true });
    service.recordResult(command, { ok: false, error: "failed" });

    for (let index = 0; index < 205; index += 1) {
      service.authorize({ remoteAddress: "127.0.0.1", token: "bad", command }, "lobby", true);
    }

    expect(service.getLogs()).toHaveLength(200);
    expect(service.getLogs().at(-1)).toMatchObject({ result: "rejected", detail: "房主权限无效" });
  });
});
