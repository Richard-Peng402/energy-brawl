import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";

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
