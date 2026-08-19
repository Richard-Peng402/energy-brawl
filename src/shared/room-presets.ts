import { isCharacterId, type CharacterId } from "./character-catalog";
import { MAX_EXCLUSIVE_SKILL_COOLDOWN_MS, MIN_EXCLUSIVE_SKILL_COOLDOWN_MS } from "./constants";
import { isBotDifficulty, type BotDifficulty } from "./bot-difficulty";
import { MAP_CATALOG, type MapSelection } from "./map-catalog";
import { isMatchMode, type MatchMode } from "./mode-catalog";
import type { AdminStat, AdminStats } from "./protocol";
import { normalizeEliminationRules, type EliminationRules } from "./team-elimination";

export interface RoomPresetV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  updatedAt: number;
  matchMode: MatchMode;
  mapSelection: MapSelection;
  mapMechanicsEnabled: boolean;
  mapEventsEnabled: boolean;
  botDifficulty: BotDifficulty;
  eliminationRules?: Partial<EliminationRules>;
  characterOverrides: Partial<Record<CharacterId, Partial<AdminStats>>>;
}

export const ADMIN_STAT_RANGES: Readonly<Record<AdminStat, readonly [number, number]>> = {
  health: [0, 500],
  maxHealth: [1, 500],
  damage: [0, 200],
  score: [0, 99],
  moveSpeed: [50, 600],
  fireCooldownMs: [100, 2_000],
  projectileSpeed: [100, 2_000],
  kills: [0, 99],
  energyCollected: [0, 999],
  exclusiveSkillCooldownMs: [MIN_EXCLUSIVE_SKILL_COOLDOWN_MS, MAX_EXCLUSIVE_SKILL_COOLDOWN_MS],
};

export type RoomPresetNormalization = { ok: true; preset: RoomPresetV1 } | { ok: false; error: string };

export function normalizeRoomPreset(value: unknown): RoomPresetNormalization {
  if (!value || typeof value !== "object") return invalid("房间预设格式无效");
  const candidate = value as Partial<RoomPresetV1>;
  if (candidate.schemaVersion !== 1) return invalid("房间预设版本无效");
  if (typeof candidate.id !== "string" || candidate.id.trim().length < 1 || candidate.id.trim().length > 64) return invalid("房间预设标识无效");
  if (typeof candidate.name !== "string" || candidate.name.trim().length < 1 || candidate.name.trim().length > 24) return invalid("房间预设名称无效");
  if (!Number.isFinite(candidate.updatedAt) || candidate.updatedAt! < 0) return invalid("房间预设时间无效");
  if (!isMatchMode(candidate.matchMode)) return invalid("房间预设模式无效");
  if (candidate.mapSelection !== "random" && !MAP_CATALOG.some((map) => map.id === candidate.mapSelection)) return invalid("房间预设地图无效");
  const mapSelection = candidate.mapSelection as MapSelection;
  if (typeof candidate.mapMechanicsEnabled !== "boolean" || typeof candidate.mapEventsEnabled !== "boolean") return invalid("房间预设地图开关无效");
  if (!isBotDifficulty(candidate.botDifficulty)) return invalid("房间预设机器人难度无效");
  if (!candidate.characterOverrides || typeof candidate.characterOverrides !== "object" || Array.isArray(candidate.characterOverrides)) return invalid("房间预设角色参数无效");
  const eliminationRulesResult = normalizeEliminationRules(candidate.eliminationRules);
  if (!eliminationRulesResult.ok) return eliminationRulesResult;

  const characterOverrides: RoomPresetV1["characterOverrides"] = {};
  for (const [characterId, rawStats] of Object.entries(candidate.characterOverrides)) {
    if (!isCharacterId(characterId) || !rawStats || typeof rawStats !== "object" || Array.isArray(rawStats)) return invalid("房间预设角色参数无效");
    const stats: Partial<AdminStats> = {};
    for (const [stat, rawValue] of Object.entries(rawStats)) {
      if (!(stat in ADMIN_STAT_RANGES) || !Number.isFinite(rawValue)) return invalid("房间预设数值无效");
      const [minimum, maximum] = ADMIN_STAT_RANGES[stat as AdminStat];
      if ((rawValue as number) < minimum || (rawValue as number) > maximum) return invalid("房间预设数值超出安全范围");
      stats[stat as AdminStat] = rawValue as number;
    }
    if (stats.health !== undefined && stats.maxHealth !== undefined && stats.health > stats.maxHealth) return invalid("房间预设生命值超过上限");
    characterOverrides[characterId] = stats;
  }

  const eliminationRules = candidate.matchMode === "teamElimination3v3" || candidate.eliminationRules !== undefined
    ? eliminationRulesResult.rules
    : undefined;
  return {
    ok: true,
    preset: {
      schemaVersion: 1,
      id: candidate.id.trim(),
      name: candidate.name.trim(),
      updatedAt: candidate.updatedAt!,
      matchMode: candidate.matchMode,
      mapSelection,
      mapMechanicsEnabled: candidate.mapMechanicsEnabled,
      mapEventsEnabled: candidate.mapEventsEnabled,
      botDifficulty: candidate.botDifficulty,
      ...(eliminationRules ? { eliminationRules } : {}),
      characterOverrides,
    },
  };
}

function invalid(error: string): RoomPresetNormalization {
  return { ok: false, error };
}
