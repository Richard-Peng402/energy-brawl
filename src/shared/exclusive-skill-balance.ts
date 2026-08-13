import type { ExclusiveSkillId } from "./exclusive-skill-catalog";

export interface ExclusiveSkillBalance {
  id: ExclusiveSkillId;
  durationMs: number;
  dashDistance?: number;
  dashDurationMs?: number;
  anchorDurationMs?: number;
  radius?: number;
  pulseDurationMs?: number;
  selfHeal?: number;
  allyHeal?: number;
  frontalDamageMultiplier?: number;
  allyDamageMultiplier?: number;
  suppressionFireCooldownMultiplier?: number;
  suppressionRadius?: number;
  selfMoveSpeedMultiplier?: number;
  fireCooldownMultiplier?: number;
  moveSpeedMultiplier?: number;
  damageMultiplier?: number;
  fireLockDurationMs?: number;
  revealDurationMs?: number;
}

export const EXCLUSIVE_SKILL_BALANCE: readonly ExclusiveSkillBalance[] = [
  { id: "breach", durationMs: 5_000, dashDistance: 340, dashDurationMs: 180, anchorDurationMs: 5_000 },
  { id: "pulse-heal", durationMs: 350, radius: 280, pulseDurationMs: 350, selfHeal: 28, allyHeal: 34 },
  { id: "mobile-bulwark", durationMs: 4_000, frontalDamageMultiplier: 0.55, allyDamageMultiplier: 0.75, suppressionFireCooldownMultiplier: 1.25, suppressionRadius: 240, selfMoveSpeedMultiplier: 0.9 },
  { id: "capacitor-overload", durationMs: 4_000, fireCooldownMultiplier: 0.7, moveSpeedMultiplier: 1.15 },
  { id: "phase-shift", durationMs: 1_200, dashDistance: 400, fireLockDurationMs: 250, revealDurationMs: 1_200 },
  { id: "afterimage-run", durationMs: 4_000, moveSpeedMultiplier: 1.28, damageMultiplier: 1.15 },
];

const BY_ID = new Map(EXCLUSIVE_SKILL_BALANCE.map((skill) => [skill.id, skill]));

export function getExclusiveSkillBalance(id: ExclusiveSkillId): ExclusiveSkillBalance {
  const balance = BY_ID.get(id);
  if (!balance) throw new Error(`Unknown exclusive skill balance: ${id}`);
  return balance;
}
