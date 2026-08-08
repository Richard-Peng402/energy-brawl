import type { CharacterId } from "./character-catalog";
import { DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS } from "./constants";

export type ExclusiveSkillId = "breach" | "pulse-heal" | "mobile-bulwark" | "capacitor-overload" | "phase-shift" | "afterimage-run";
export type ExclusiveEffectKind = "anchor-dash" | "area-heal" | "frontal-bulwark" | "rapid-fire" | "wall-teleport" | "afterimage";

export interface ExclusiveSkillDefinition {
  id: ExclusiveSkillId;
  characterId: CharacterId;
  name: string;
  description: string;
  cooldownMs: number;
  durationMs: number;
  effectKind: ExclusiveEffectKind;
}

export const EXCLUSIVE_SKILL_CATALOG: readonly ExclusiveSkillDefinition[] = [
  { id: "breach", characterId: "blaze", name: "破阵突进", description: "留下锚点，突进后可返回锚点", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 5_000, effectKind: "anchor-dash" },
  { id: "pulse-heal", characterId: "medic", name: "脉冲急救", description: "治疗自己与附近队友", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 0, effectKind: "area-heal" },
  { id: "mobile-bulwark", characterId: "fortress", name: "移动壁垒", description: "正面减伤并降低附近敌人射速", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 4_000, effectKind: "frontal-bulwark" },
  { id: "capacitor-overload", characterId: "arc", name: "电容过载", description: "短时强化射速与移动速度", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 5_000, effectKind: "rapid-fire" },
  { id: "phase-shift", characterId: "phase", name: "相位折跃", description: "短距离穿梭，可穿墙但终点必须安全", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 0, effectKind: "wall-teleport" },
  { id: "afterimage-run", characterId: "runner", name: "残像疾奔", description: "加速跑图并提高子弹伤害", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 5_000, effectKind: "afterimage" },
];

const BY_CHARACTER = new Map(EXCLUSIVE_SKILL_CATALOG.map((skill) => [skill.characterId, skill]));
export function getExclusiveSkill(characterId: CharacterId): ExclusiveSkillDefinition { return BY_CHARACTER.get(characterId)!; }
export function isExclusiveSkillId(value: unknown): value is ExclusiveSkillId { return typeof value === "string" && EXCLUSIVE_SKILL_CATALOG.some((skill) => skill.id === value); }
