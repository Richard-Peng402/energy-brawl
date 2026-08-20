import { describe, expect, it } from "vitest";
import { RoomDirectory } from "../src/server/room-directory";

describe("room directory", () => {
  it("creates unique six-character room codes and lists joinable rooms", () => {
    const directory = new RoomDirectory();
    const created = directory.createRoom("socket-host");
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(directory.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: created.code, playerCount: 0, phase: "lobby" }),
    ]));
  });

  it("keeps rooms isolated and does not resolve unknown reconnect tokens", () => {
    const directory = new RoomDirectory();
    const first = directory.createRoom("socket-a");
    const second = directory.createRoom("socket-b");
    expect(directory.get(first.code)).not.toBe(directory.get(second.code));
    expect(directory.findByReconnectToken("unknown-token")).toBeUndefined();
  });
});
