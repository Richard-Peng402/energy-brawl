import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import type { ExclusiveSkillEventStage } from "../shared/protocol";
import type { SynthTone } from "./combat-audio";

export interface ExclusiveSkillAudioProfile {
  skillId: ExclusiveSkillId;
  stage: ExclusiveSkillEventStage;
  sampleUrl: string;
  fallbackTones: readonly SynthTone[];
  gain: number;
  maxDistance: number;
  priority: number;
  loop: boolean;
  maxDurationMs: number;
}

const SKILL_AUDIO_BASE: Readonly<Record<ExclusiveSkillId, { frequency: number; type: OscillatorType; gain: number }>> = {
  breach: { frequency: 190, type: "sawtooth", gain: 0.88 },
  "pulse-heal": { frequency: 520, type: "sine", gain: 0.8 },
  "mobile-bulwark": { frequency: 125, type: "square", gain: 0.86 },
  "capacitor-overload": { frequency: 760, type: "triangle", gain: 0.84 },
  "phase-shift": { frequency: 340, type: "sine", gain: 0.82 },
  "afterimage-run": { frequency: 430, type: "triangle", gain: 0.82 },
};

const STAGE_SETTINGS: Readonly<Record<ExclusiveSkillEventStage, {
  frequencyMultiplier: number;
  endMultiplier: number;
  priority: number;
  duration: number;
  volume: number;
}>> = {
  cast: { frequencyMultiplier: 1, endMultiplier: 1.72, priority: 72, duration: 0.18, volume: 0.22 },
  active: { frequencyMultiplier: 1.28, endMultiplier: 0.86, priority: 54, duration: 0.24, volume: 0.14 },
  end: { frequencyMultiplier: 0.82, endMultiplier: 0.48, priority: 38, duration: 0.16, volume: 0.12 },
};

export function getExclusiveSkillAudioProfile(
  skillId: ExclusiveSkillId,
  stage: ExclusiveSkillEventStage,
): ExclusiveSkillAudioProfile {
  const base = SKILL_AUDIO_BASE[skillId];
  const settings = STAGE_SETTINGS[stage];
  const startFrequency = base.frequency * settings.frequencyMultiplier;
  const accentFrequency = startFrequency * (stage === "active" ? 1.18 : 1.42);
  return {
    skillId,
    stage,
    sampleUrl: `/assets/v4/audio/exclusive-skills/${skillId}/${stage}.ogg`,
    fallbackTones: [
      {
        type: base.type,
        startFrequency,
        endFrequency: startFrequency * settings.endMultiplier,
        duration: settings.duration,
        volume: settings.volume,
        delay: 0,
      },
      {
        type: stage === "end" ? "sine" : "triangle",
        startFrequency: accentFrequency,
        endFrequency: accentFrequency * (stage === "end" ? 0.62 : 1.22),
        duration: settings.duration * 0.72,
        volume: settings.volume * 0.62,
        delay: settings.duration * 0.28,
      },
    ],
    gain: base.gain * (stage === "active" ? 0.72 : stage === "end" ? 0.68 : 1),
    maxDistance: stage === "cast" ? 1_450 : 1_100,
    priority: settings.priority,
    loop: false,
    maxDurationMs: Math.round((settings.duration * 1.2 + settings.duration * 0.28) * 1_000),
  };
}

export function exclusiveSkillHapticPattern(
  skillId: ExclusiveSkillId,
  stage: ExclusiveSkillEventStage,
): readonly number[] {
  const base = ({
    breach: 46,
    "pulse-heal": 34,
    "mobile-bulwark": 58,
    "capacitor-overload": 40,
    "phase-shift": 30,
    "afterimage-run": 28,
  } satisfies Record<ExclusiveSkillId, number>)[skillId];
  if (stage === "cast") return [base, Math.round(base * 0.35), Math.round(base * 0.72)];
  if (stage === "active") return [Math.round(base * 0.62)];
  return [Math.max(14, Math.round(base * 0.42))];
}
