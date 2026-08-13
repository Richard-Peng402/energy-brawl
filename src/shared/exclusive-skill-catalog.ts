import type { CharacterId } from "./character-catalog";
import { DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS } from "./constants";
import { getExclusiveSkillBalance, type ExclusiveSkillBalance } from "./exclusive-skill-balance";

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
  balance: ExclusiveSkillBalance;
}

export const EXCLUSIVE_SKILL_CATALOG: readonly ExclusiveSkillDefinition[] = [
  { id: "breach", characterId: "blaze", name: "破阵突进", description: "留下锚点，突进后可返回锚点", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 5_000, effectKind: "anchor-dash", balance: getExclusiveSkillBalance("breach") },
  { id: "pulse-heal", characterId: "medic", name: "脉冲急救", description: "治疗自己与附近队友并净化压制", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 350, effectKind: "area-heal", balance: getExclusiveSkillBalance("pulse-heal") },
  { id: "mobile-bulwark", characterId: "fortress", name: "移动壁垒", description: "正面减伤并降低附近敌人射速", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 4_000, effectKind: "frontal-bulwark", balance: getExclusiveSkillBalance("mobile-bulwark") },
  { id: "capacitor-overload", characterId: "arc", name: "电容过载", description: "短时强化射速与移动速度", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 4_000, effectKind: "rapid-fire", balance: getExclusiveSkillBalance("capacitor-overload") },
  { id: "phase-shift", characterId: "phase", name: "相位折跃", description: "短距离穿梭，可穿墙但终点必须安全", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 1_200, effectKind: "wall-teleport", balance: getExclusiveSkillBalance("phase-shift") },
  { id: "afterimage-run", characterId: "runner", name: "残像疾奔", description: "加速跑图并提高子弹伤害", cooldownMs: DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS, durationMs: 4_000, effectKind: "afterimage", balance: getExclusiveSkillBalance("afterimage-run") },
];

const BY_CHARACTER = new Map(EXCLUSIVE_SKILL_CATALOG.map((skill) => [skill.characterId, skill]));
export function getExclusiveSkill(characterId: CharacterId): ExclusiveSkillDefinition { return BY_CHARACTER.get(characterId)!; }
export function isExclusiveSkillId(value: unknown): value is ExclusiveSkillId { return typeof value === "string" && EXCLUSIVE_SKILL_CATALOG.some((skill) => skill.id === value); }

export function getExclusiveSkillCounterSummary(characterId: CharacterId): string {
  const { id, balance } = getExclusiveSkill(characterId);
  switch (id) {
    case "breach": return `突进 ${balance.dashDistance} · 位移 ${balance.dashDurationMs}ms · 锚点 ${Math.round((balance.anchorDurationMs ?? 0) / 1_000)}秒`;
    case "pulse-heal": return `自身 +${balance.selfHeal} · 队友 +${balance.allyHeal} · 半径 ${balance.radius} · 净化压制`;
    case "mobile-bulwark": return `正面减伤 ${Math.round((1 - (balance.frontalDamageMultiplier ?? 1)) * 100)}% · 队友减伤 ${Math.round((1 - (balance.allyDamageMultiplier ?? 1)) * 100)}% · 敌方射速压制 25%`;
    case "capacitor-overload": return `射击间隔 -${Math.round((1 - (balance.fireCooldownMultiplier ?? 1)) * 100)}% · 移速 +${Math.round(((balance.moveSpeedMultiplier ?? 1) - 1) * 100)}%`;
    case "phase-shift": return `折跃 ${balance.dashDistance} · 武器锁定 ${balance.fireLockDurationMs}ms · 显形 ${(balance.revealDurationMs ?? 0) / 1_000}秒`;
    case "afterimage-run": return `移速 +${Math.round(((balance.moveSpeedMultiplier ?? 1) - 1) * 100)}% · 伤害 +${Math.round(((balance.damageMultiplier ?? 1) - 1) * 100)}%`;
  }
}
