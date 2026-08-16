import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";

export type ExclusiveSkillVfxStage = "telegraph" | "cast" | "active" | "end";

export interface ExclusiveStageVfxProfile {
  durationMs: number;
  textureKey: string;
  blendMode: "add" | "screen" | "normal";
  scale: number;
  alpha: number;
  color: number;
  shape: "path" | "ring" | "arc" | "corridor" | "afterimage" | "field";
}

export interface ExclusiveSkillVfxProfile {
  skillId: ExclusiveSkillId;
  poolCapacity: number;
  stages: Record<ExclusiveSkillVfxStage, ExclusiveStageVfxProfile>;
}

const stageTextureKey = (skillId: ExclusiveSkillId, stage: ExclusiveSkillVfxStage): string =>
  `exclusive-skill:${skillId}:${stage}`;

const PROFILES: Readonly<Record<ExclusiveSkillId, ExclusiveSkillVfxProfile>> = {
  breach: {
    skillId: "breach",
    poolCapacity: 12,
    stages: {
      telegraph: { durationMs: 0, textureKey: stageTextureKey("breach", "telegraph"), blendMode: "add", scale: 1, alpha: 0.82, color: 0xff5f45, shape: "path" },
      cast: { durationMs: 160, textureKey: stageTextureKey("breach", "cast"), blendMode: "add", scale: 1.08, alpha: 0.96, color: 0xff7a42, shape: "ring" },
      active: { durationMs: 620, textureKey: stageTextureKey("breach", "active"), blendMode: "screen", scale: 1.22, alpha: 0.78, color: 0xff4b36, shape: "afterimage" },
      end: { durationMs: 360, textureKey: stageTextureKey("breach", "end"), blendMode: "add", scale: 1.18, alpha: 0.86, color: 0xffb15c, shape: "ring" },
    },
  },
  "pulse-heal": {
    skillId: "pulse-heal",
    poolCapacity: 10,
    stages: {
      telegraph: { durationMs: 0, textureKey: stageTextureKey("pulse-heal", "telegraph"), blendMode: "normal", scale: 1, alpha: 0.5, color: 0x59f2c6, shape: "field" },
      cast: { durationMs: 180, textureKey: stageTextureKey("pulse-heal", "cast"), blendMode: "screen", scale: 1.04, alpha: 0.9, color: 0x72ffd5, shape: "ring" },
      active: { durationMs: 720, textureKey: stageTextureKey("pulse-heal", "active"), blendMode: "screen", scale: 1.28, alpha: 0.68, color: 0x45dcb2, shape: "field" },
      end: { durationMs: 420, textureKey: stageTextureKey("pulse-heal", "end"), blendMode: "screen", scale: 0.92, alpha: 0.62, color: 0xb4ffe9, shape: "ring" },
    },
  },
  "mobile-bulwark": {
    skillId: "mobile-bulwark",
    poolCapacity: 14,
    stages: {
      telegraph: { durationMs: 0, textureKey: stageTextureKey("mobile-bulwark", "telegraph"), blendMode: "normal", scale: 1, alpha: 0.58, color: 0x68c8ff, shape: "arc" },
      cast: { durationMs: 210, textureKey: stageTextureKey("mobile-bulwark", "cast"), blendMode: "screen", scale: 1.12, alpha: 0.94, color: 0x83d7ff, shape: "arc" },
      active: { durationMs: 780, textureKey: stageTextureKey("mobile-bulwark", "active"), blendMode: "normal", scale: 1.2, alpha: 0.72, color: 0x3fa9e8, shape: "field" },
      end: { durationMs: 520, textureKey: stageTextureKey("mobile-bulwark", "end"), blendMode: "add", scale: 0.9, alpha: 0.78, color: 0x9ce2ff, shape: "arc" },
    },
  },
  "capacitor-overload": {
    skillId: "capacitor-overload",
    poolCapacity: 16,
    stages: {
      telegraph: { durationMs: 0, textureKey: stageTextureKey("capacitor-overload", "telegraph"), blendMode: "add", scale: 0.9, alpha: 0.76, color: 0x47e4ff, shape: "ring" },
      cast: { durationMs: 140, textureKey: stageTextureKey("capacitor-overload", "cast"), blendMode: "add", scale: 1.06, alpha: 1, color: 0x66efff, shape: "corridor" },
      active: { durationMs: 560, textureKey: stageTextureKey("capacitor-overload", "active"), blendMode: "screen", scale: 1.16, alpha: 0.78, color: 0x31bfff, shape: "field" },
      end: { durationMs: 380, textureKey: stageTextureKey("capacitor-overload", "end"), blendMode: "add", scale: 1, alpha: 0.72, color: 0xb3f8ff, shape: "ring" },
    },
  },
  "phase-shift": {
    skillId: "phase-shift",
    poolCapacity: 12,
    stages: {
      telegraph: { durationMs: 0, textureKey: stageTextureKey("phase-shift", "telegraph"), blendMode: "screen", scale: 1, alpha: 0.74, color: 0xb56cff, shape: "corridor" },
      cast: { durationMs: 120, textureKey: stageTextureKey("phase-shift", "cast"), blendMode: "add", scale: 1.04, alpha: 0.98, color: 0xca7dff, shape: "corridor" },
      active: { durationMs: 480, textureKey: stageTextureKey("phase-shift", "active"), blendMode: "screen", scale: 1.18, alpha: 0.82, color: 0x8f5bff, shape: "path" },
      end: { durationMs: 300, textureKey: stageTextureKey("phase-shift", "end"), blendMode: "add", scale: 0.86, alpha: 0.9, color: 0xe0b2ff, shape: "ring" },
    },
  },
  "afterimage-run": {
    skillId: "afterimage-run",
    poolCapacity: 18,
    stages: {
      telegraph: { durationMs: 0, textureKey: stageTextureKey("afterimage-run", "telegraph"), blendMode: "normal", scale: 1, alpha: 0.66, color: 0xffd166, shape: "path" },
      cast: { durationMs: 100, textureKey: stageTextureKey("afterimage-run", "cast"), blendMode: "add", scale: 1.02, alpha: 0.96, color: 0xffdf7d, shape: "ring" },
      active: { durationMs: 680, textureKey: stageTextureKey("afterimage-run", "active"), blendMode: "screen", scale: 1.24, alpha: 0.76, color: 0xf4b942, shape: "afterimage" },
      end: { durationMs: 440, textureKey: stageTextureKey("afterimage-run", "end"), blendMode: "screen", scale: 0.94, alpha: 0.7, color: 0xffefb0, shape: "afterimage" },
    },
  },
};

export function getExclusiveSkillVfxProfile(skillId: ExclusiveSkillId): ExclusiveSkillVfxProfile {
  const profile = PROFILES[skillId];
  return {
    ...profile,
    stages: {
      telegraph: { ...profile.stages.telegraph },
      cast: { ...profile.stages.cast },
      active: { ...profile.stages.active },
      end: { ...profile.stages.end },
    },
  };
}
