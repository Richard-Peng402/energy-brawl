import { PLAYER_COLORS } from "./constants";
import { getCharacterBalance } from "./character-balance";

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

const balanceFields = (id: CharacterId) => {
  const { maxHealth, damage, moveSpeed, fireCooldownMs, projectileSpeed } = getCharacterBalance(id);
  return { maxHealth, damage, moveSpeed, fireCooldownMs, projectileSpeed };
};

export const CHARACTER_CATALOG: readonly CharacterDefinition[] = [
  { id: "blaze", name: "烈锋", color: PLAYER_COLORS[0], role: "突击手", passiveName: "过载弹头", passiveDescription: "稳定的近中程突入火力。", advantage: "单发伤害 24", tradeoff: "射击间隔 600ms", ...balanceFields("blaze") },
  { id: "medic", name: "脉冲医师", color: PLAYER_COLORS[1], role: "续航支援", passiveName: "能量回流", passiveDescription: "拾取普通能量球恢复 12 点生命。", advantage: "最大生命 108", tradeoff: "单发伤害 18", ...balanceFields("medic") },
  { id: "fortress", name: "堡垒", color: PLAYER_COLORS[2], role: "重装防御", passiveName: "强化装甲", passiveDescription: "最大生命提高，正面技能防御更强。", advantage: "最大生命 136", tradeoff: "移动速度 225", ...balanceFields("fortress") },
  { id: "arc", name: "电弧枪手", color: PLAYER_COLORS[3], role: "持续火力", passiveName: "电容供弹", passiveDescription: "射击间隔最短，适合持续压制。", advantage: "射击间隔 360ms", tradeoff: "单发伤害 14", ...balanceFields("arc") },
  { id: "phase", name: "相位狙手", color: PLAYER_COLORS[4], role: "远程压制", passiveName: "相位弹道", passiveDescription: "弹丸速度与单发伤害最高。", advantage: "单发伤害 30", tradeoff: "射击间隔 900ms", ...balanceFields("phase") },
  { id: "runner", name: "疾行者", color: PLAYER_COLORS[5], role: "高速游击", passiveName: "轻量推进", passiveDescription: "移动速度最高，适合侧翼骚扰。", advantage: "移动速度 310", tradeoff: "最大生命 92", ...balanceFields("runner") },
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
