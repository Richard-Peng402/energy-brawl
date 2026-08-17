import type { RoomSnapshot } from "../shared/protocol";
import { normalizeRoomPreset, type RoomPresetV1 } from "../shared/room-presets";

const STORAGE_KEY = "energy-brawl:room-presets:v1";
const MAX_PRESETS = 8;

export class RoomPresetStore {
  private presets: RoomPresetV1[];

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem">) {
    this.presets = this.read();
  }

  list(): RoomPresetV1[] {
    return structuredClone(this.presets);
  }

  save(preset: RoomPresetV1): boolean {
    const normalized = normalizeRoomPreset(preset);
    if (!normalized.ok) return false;
    this.presets = [normalized.preset, ...this.presets.filter((candidate) => candidate.id !== normalized.preset.id)]
      .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
      .slice(0, MAX_PRESETS);
    this.persist();
    return true;
  }

  rename(id: string, name: string, updatedAt = Date.now()): boolean {
    const preset = this.presets.find((candidate) => candidate.id === id);
    if (!preset) return false;
    return this.save({ ...preset, name, updatedAt });
  }

  remove(id: string): boolean {
    const next = this.presets.filter((candidate) => candidate.id !== id);
    if (next.length === this.presets.length) return false;
    this.presets = next;
    this.persist();
    return true;
  }

  static fromRoom(
    room: RoomSnapshot,
    name: string,
    id = `preset-${Date.now().toString(36)}`,
    updatedAt = Date.now(),
  ): RoomPresetV1 {
    const characterOverrides: RoomPresetV1["characterOverrides"] = {};
    for (const player of room.players) {
      characterOverrides[player.characterId] = {
        health: player.health,
        maxHealth: player.maxHealth,
        damage: player.damage,
        score: player.score,
        moveSpeed: player.moveSpeed,
        fireCooldownMs: player.fireCooldownMs,
        projectileSpeed: player.projectileSpeed,
        kills: player.kills,
        energyCollected: player.energyCollected,
        exclusiveSkillCooldownMs: player.exclusiveSkillCooldownMs,
      };
    }
    return {
      schemaVersion: 1,
      id,
      name,
      updatedAt,
      matchMode: room.matchMode ?? "solo",
      mapSelection: room.mapSelection ?? "reactor-core",
      mapMechanicsEnabled: room.mapMechanicsEnabled ?? true,
      mapEventsEnabled: room.mapEventsEnabled ?? true,
      botDifficulty: room.botDifficulty ?? "normal",
      characterOverrides,
    };
  }

  private read(): RoomPresetV1[] {
    try {
      const parsed = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((value) => {
        const normalized = normalizeRoomPreset(value);
        return normalized.ok ? [normalized.preset] : [];
      }).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, MAX_PRESETS);
    } catch {
      return [];
    }
  }

  private persist(): void {
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.presets)); } catch { /* Storage can be unavailable in private mode. */ }
  }
}
