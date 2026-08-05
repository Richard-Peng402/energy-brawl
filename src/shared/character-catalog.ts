import {
  FIRE_COOLDOWN_MS,
  MAX_HEALTH,
  PLAYER_COLORS,
  PLAYER_SPEED,
  PROJECTILE_DAMAGE,
  PROJECTILE_SPEED,
} from "./constants";

export type CharacterId = "blaze" | "medic" | "fortress" | "arc" | "phase" | "runner";
export const MEDIC_ENERGY_HEAL = 12;

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  color: string;
  role: string;
  passiveName: string;
  passiveDescription: string;
  advantage: string;
  tradeoff: string;
  maxHealth: number;
  damage: number;
  moveSpeed: number;
  fireCooldownMs: number;
  projectileSpeed: number;
}

const base = {
  maxHealth: MAX_HEALTH,
  damage: PROJECTILE_DAMAGE,
  moveSpeed: PLAYER_SPEED,
  fireCooldownMs: FIRE_COOLDOWN_MS,
  projectileSpeed: PROJECTILE_SPEED,
};

export const CHARACTER_CATALOG: readonly CharacterDefinition[] = [
  { id: "blaze", name: "烈锋", color: PLAYER_COLORS[0], role: "突击手", passiveName: "过载弹头", passiveDescription: "普通射击伤害提高。", advantage: "单发伤害 27", tradeoff: "最大生命 94", ...base, maxHealth: 94, damage: 27 },
  { id: "medic", name: "脉冲医师", color: PLAYER_COLORS[1], role: "续航支援", passiveName: "能量回流", passiveDescription: "拾取普通能量球恢复 12 点生命。", advantage: "能量球治疗 12", tradeoff: "单发伤害 23", ...base, damage: 23 },
  { id: "fortress", name: "堡垒", color: PLAYER_COLORS[2], role: "重装防御", passiveName: "强化装甲", passiveDescription: "最大生命提高。", advantage: "最大生命 112", tradeoff: "移动速度 252", ...base, maxHealth: 112, moveSpeed: 252 },
  { id: "arc", name: "电弧枪手", color: PLAYER_COLORS[3], role: "持续火力", passiveName: "电容供弹", passiveDescription: "射击间隔缩短。", advantage: "射击间隔 415ms", tradeoff: "单发伤害 23", ...base, damage: 23, fireCooldownMs: 415 },
  { id: "phase", name: "相位狙手", color: PLAYER_COLORS[4], role: "远程压制", passiveName: "相位弹道", passiveDescription: "弹丸飞行速度提高。", advantage: "弹丸速度 700", tradeoff: "射击间隔 490ms", ...base, fireCooldownMs: 490, projectileSpeed: 700 },
  { id: "runner", name: "疾行者", color: PLAYER_COLORS[5], role: "高速游击", passiveName: "轻量推进", passiveDescription: "移动速度提高。", advantage: "移动速度 282", tradeoff: "最大生命 92", ...base, maxHealth: 92, moveSpeed: 282 },
];

const BY_ID = new Map(CHARACTER_CATALOG.map((character) => [character.id, character]));

export function getCharacter(id: CharacterId): CharacterDefinition {
  const character = BY_ID.get(id);
  if (!character) throw new Error(`Unknown character: ${id}`);
  return character;
}

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && BY_ID.has(value as CharacterId);
}
