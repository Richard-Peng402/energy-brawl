import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { RoomPresetStore } from "../src/client/room-preset-store";
import type { RoomSnapshot } from "../src/shared/protocol";

const hostApp = readFileSync(new URL("../src/client/host-app.ts", import.meta.url), "utf8");

describe("host room preset controls", () => {
  it("recovers from corrupt storage and caps presets at eight", () => {
    const storage = memoryStorage({ "energy-brawl:room-presets:v1": "not-json" });
    const store = new RoomPresetStore(storage);
    expect(store.list()).toEqual([]);
    for (let index = 0; index < 10; index += 1) {
      store.save(RoomPresetStore.fromRoom(room(), `预设${index}`, `preset-${index}`, index));
    }
    expect(store.list()).toHaveLength(8);
    expect(store.list()[0]!.id).toBe("preset-9");
  });

  it("never persists player ids or force-winner actions", () => {
    const json = JSON.stringify(RoomPresetStore.fromRoom(room(), "安全预设", "safe", 1_000));
    expect(json).not.toContain("player-1");
    expect(json).not.toContain("pendingWinner");
    expect(json).not.toContain("forceWinner");
  });

  it("adds save, apply, rename, delete, and bot difficulty controls", () => {
    for (const id of ["host-preset", "host-preset-save", "host-preset-apply", "host-preset-rename", "host-preset-delete", "host-bot-difficulty"]) {
      expect(hostApp).toContain(`id="${id}"`);
    }
    expect(hostApp).toContain('{ type: "applyRoomPreset", preset }');
    expect(hostApp).toContain('{ type: "setBotDifficulty", difficulty:');
  });
});

function room(): RoomSnapshot {
  return {
    phase: "lobby",
    canStart: true,
    pendingWinnerId: "player-1",
    matchMode: "team3v3",
    mapSelection: "neon-docks",
    mapMechanicsEnabled: true,
    mapEventsEnabled: false,
    botDifficulty: "hard",
    players: [{
      id: "player-1", nickname: "玩家", characterId: "blaze", tacticalModuleId: "ballistic-acceleration",
      color: "#f00", isBot: false, connected: true, ready: true, teamId: "red",
      health: 120, maxHealth: 120, damage: 28, score: 3, moveSpeed: 280,
      fireCooldownMs: 500, projectileSpeed: 720, kills: 2, energyCollected: 4,
      exclusiveSkillCooldownMs: 9_000,
    }],
  };
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}
