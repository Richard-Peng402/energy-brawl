import { describe, expect, it } from "vitest";

import { GameRoom } from "../src/server/room";
import { normalizeRoomPreset, type RoomPresetV1 } from "../src/shared/room-presets";

describe("atomic room presets", () => {
  it("normalizes a complete versioned preset", () => {
    expect(normalizeRoomPreset(preset())).toEqual({ ok: true, preset: preset() });
  });

  it("rejects an invalid preset without changing any room setting", () => {
    const room = new GameRoom();
    room.joinHuman("socket", { nickname: "测试", characterId: "blaze" });
    const before = structuredClone(room.snapshot());
    const invalid = preset({
      characterOverrides: { blaze: { damage: 999_999 } },
    });

    expect(room.applyHostAdminCommand({ type: "applyRoomPreset", preset: invalid }).ok).toBe(false);
    expect(room.snapshot()).toEqual(before);
  });

  it("applies rules, bot difficulty, and character overrides in one lobby command", () => {
    const room = new GameRoom();
    const joined = room.joinHuman("socket", { nickname: "测试", characterId: "blaze" });
    expect(joined.ok).toBe(true);

    expect(room.applyHostAdminCommand({
      type: "applyRoomPreset",
      preset: preset({
        matchMode: "team3v3",
        mapSelection: "crystal-ruins",
        mapMechanicsEnabled: false,
        mapEventsEnabled: false,
        botDifficulty: "hard",
        characterOverrides: { blaze: { health: 140, maxHealth: 140, damage: 31 } },
      }),
    })).toEqual({ ok: true });

    expect(room.snapshot()).toMatchObject({
      matchMode: "team3v3",
      mapSelection: "crystal-ruins",
      mapMechanicsEnabled: false,
      mapEventsEnabled: false,
      botDifficulty: "hard",
      players: [expect.objectContaining({ health: 140, maxHealth: 140, damage: 31 })],
    });
  });

  it("rejects preset application after the match starts", () => {
    const room = new GameRoom();
    room.joinHuman("socket", { nickname: "测试", characterId: "blaze" });
    room.setReady("socket", true);
    room.startMatch();
    expect(room.applyHostAdminCommand({ type: "applyRoomPreset", preset: preset() }).ok).toBe(false);
  });
});

function preset(overrides: Partial<RoomPresetV1> = {}): RoomPresetV1 {
  return {
    schemaVersion: 1,
    id: "preset-1",
    name: "标准房间",
    updatedAt: 1_000,
    matchMode: "solo",
    mapSelection: "reactor-core",
    mapMechanicsEnabled: true,
    mapEventsEnabled: true,
    botDifficulty: "normal",
    characterOverrides: {},
    ...overrides,
  };
}
