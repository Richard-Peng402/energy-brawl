import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import type { StatusEffectId } from "../server/status-effects";
import type { CombatFeedbackEventType } from "./combat-feedback";

export interface ExclusiveEffectProfile {
  persistent: boolean;
  layers: number;
  pulseMs: number;
  innerRadius: number;
  outerRadius: number;
  rotationMs: number;
}

const EFFECT_PROFILES: Readonly<Record<ExclusiveSkillId, ExclusiveEffectProfile>> = {
  breach: { persistent: true, layers: 5, pulseMs: 520, innerRadius: 54, outerRadius: 92, rotationMs: 1_100 },
  "pulse-heal": { persistent: true, layers: 4, pulseMs: 620, innerRadius: 62, outerRadius: 280, rotationMs: 1_400 },
  "mobile-bulwark": { persistent: true, layers: 5, pulseMs: 760, innerRadius: 70, outerRadius: 280, rotationMs: 1_800 },
  "capacitor-overload": { persistent: true, layers: 6, pulseMs: 440, innerRadius: 60, outerRadius: 112, rotationMs: 780 },
  "phase-shift": { persistent: false, layers: 5, pulseMs: 360, innerRadius: 50, outerRadius: 126, rotationMs: 620 },
  "afterimage-run": { persistent: true, layers: 5, pulseMs: 520, innerRadius: 58, outerRadius: 148, rotationMs: 960 },
};

export function getExclusiveEffectProfile(skillId: ExclusiveSkillId): ExclusiveEffectProfile {
  return { ...EFFECT_PROFILES[skillId] };
}

export interface StatusEffectVisualProfile { color: number; label: string; pulseMs: number; }
const STATUS_VISUALS: Readonly<Record<StatusEffectId, StatusEffectVisualProfile>> = {
  "bulwark-suppression": { color: 0x63d9ff, label: "火力压制", pulseMs: 620 },
  "phase-reveal": { color: 0xc77dff, label: "显形", pulseMs: 420 },
  "phase-fire-lock": { color: 0xff8d70, label: "武器锁定", pulseMs: 250 },
};

export function getStatusEffectVisualProfile(id: StatusEffectId): StatusEffectVisualProfile {
  return { ...STATUS_VISUALS[id] };
}

export interface CombatCameraImpulse { maxCssPx: number; durationMs: number; throttleMs: number; }
export function combatCameraImpulse(type: CombatFeedbackEventType): CombatCameraImpulse {
  if (type === "death") return { maxCssPx: 10, durationMs: 160, throttleMs: 300 };
  return { maxCssPx: type === "hurt" ? 6 : 4, durationMs: type === "hurt" ? 90 : 80, throttleMs: 300 };
}
