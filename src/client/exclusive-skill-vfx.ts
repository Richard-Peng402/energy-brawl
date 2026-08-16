import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import type { ExclusiveSkillEvent, PlayerSnapshot } from "../shared/protocol";

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
  features: ExclusiveSkillVfxFeature[];
  stages: Record<ExclusiveSkillVfxStage, ExclusiveStageVfxProfile>;
}

export type ExclusiveSkillVfxFeature =
  | "anchor-create" | "travel" | "return" | "expiry"
  | "origin-tear" | "corridor" | "destination-assembly" | "closure"
  | "healing-flow" | "cleanse-sparkle"
  | "self-facing" | "ally-shimmer" | "enemy-suppression" | "shield-contact" | "normal-end"
  | "weapon-charge" | "active-current" | "enhanced-muzzle" | "safe-discharge"
  | "acceleration-burst" | "pooled-afterimages" | "enhanced-projectile-exhaust" | "merge-end";

export type ExclusiveSkillEndVariant =
  | "return-collapse"
  | "anchor-dissolve"
  | "phase-closure"
  | "safe-discharge"
  | "merge-end"
  | "standard";

export interface ExclusiveSkillAreaFeedback {
  kind: "healing-flow" | "cleanse-sparkle" | "ally-shimmer" | "enemy-suppression";
  targetId: string;
}

export interface ExclusiveTimedVisualState {
  progress: number;
  intensity: number;
  afterimageCount: number;
}

const stageTextureKey = (skillId: ExclusiveSkillId, stage: ExclusiveSkillVfxStage): string =>
  `exclusive-skill:${skillId}:${stage}`;

const PROFILES: Readonly<Record<ExclusiveSkillId, ExclusiveSkillVfxProfile>> = {
  breach: {
    skillId: "breach",
    poolCapacity: 12,
    features: ["anchor-create", "travel", "return", "expiry"],
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
    features: ["healing-flow", "cleanse-sparkle"],
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
    features: ["self-facing", "ally-shimmer", "enemy-suppression", "shield-contact", "normal-end"],
    stages: {
      telegraph: { durationMs: 0, textureKey: stageTextureKey("mobile-bulwark", "telegraph"), blendMode: "normal", scale: 1, alpha: 0.58, color: 0x68c8ff, shape: "arc" },
      cast: { durationMs: 210, textureKey: stageTextureKey("mobile-bulwark", "cast"), blendMode: "screen", scale: 1.12, alpha: 0.94, color: 0x83d7ff, shape: "arc" },
      active: { durationMs: 780, textureKey: stageTextureKey("mobile-bulwark", "active"), blendMode: "normal", scale: 1.2, alpha: 0.72, color: 0x3fa9e8, shape: "arc" },
      end: { durationMs: 520, textureKey: stageTextureKey("mobile-bulwark", "end"), blendMode: "add", scale: 0.9, alpha: 0.78, color: 0x9ce2ff, shape: "arc" },
    },
  },
  "capacitor-overload": {
    skillId: "capacitor-overload",
    poolCapacity: 16,
    features: ["weapon-charge", "active-current", "enhanced-muzzle", "safe-discharge"],
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
    features: ["origin-tear", "corridor", "destination-assembly", "closure"],
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
    features: ["acceleration-burst", "pooled-afterimages", "enhanced-projectile-exhaust", "merge-end"],
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
    features: [...profile.features],
    stages: {
      telegraph: { ...profile.stages.telegraph },
      cast: { ...profile.stages.cast },
      active: { ...profile.stages.active },
      end: { ...profile.stages.end },
    },
  };
}

export function resolveExclusiveSkillEndVariant(
  skillId: ExclusiveSkillId,
  reason: ExclusiveSkillEvent["reason"],
): ExclusiveSkillEndVariant {
  if (skillId === "breach" && reason === "return") return "return-collapse";
  if (skillId === "breach" && reason === "expired") return "anchor-dissolve";
  if (skillId === "phase-shift") return "phase-closure";
  if (skillId === "capacitor-overload") return "safe-discharge";
  if (skillId === "afterimage-run") return "merge-end";
  return "standard";
}

export function resolveExclusiveTimedVisualState(
  skillId: ExclusiveSkillId,
  startedAt: number,
  expiresAt: number,
  serverTime: number,
): ExclusiveTimedVisualState {
  const duration = Math.max(1, expiresAt - startedAt);
  const progress = Math.min(1, Math.max(0, (serverTime - startedAt) / duration));
  const envelope = Math.sin(progress * Math.PI);
  if (skillId === "capacitor-overload") {
    return { progress, intensity: 0.72 + envelope * 0.28, afterimageCount: 0 };
  }
  if (skillId === "afterimage-run") {
    return { progress, intensity: 0.68 + envelope * 0.32, afterimageCount: 3 + Math.round(envelope * 2) };
  }
  return { progress, intensity: 1, afterimageCount: 0 };
}

export function resolveExclusiveSkillAreaFeedback(
  event: ExclusiveSkillEvent,
  players: readonly PlayerSnapshot[],
): ExclusiveSkillAreaFeedback[] {
  if (event.skillId === "pulse-heal") {
    return [
      ...(event.metadata?.healedTargetIds ?? []).map((targetId) => ({ kind: "healing-flow" as const, targetId })),
      ...(event.metadata?.cleansedTargetIds ?? []).map((targetId) => ({ kind: "cleanse-sparkle" as const, targetId })),
    ];
  }
  if (event.skillId !== "mobile-bulwark") return [];
  const caster = players.find((player) => player.id === event.playerId);
  if (!caster || caster.teamId === null) return [];
  return (event.metadata?.affectedTargetIds ?? []).flatMap((targetId) => {
    const target = players.find((player) => player.id === targetId);
    if (!target || target.teamId === null) return [];
    return [{
      kind: target.teamId === caster.teamId ? "ally-shimmer" as const : "enemy-suppression" as const,
      targetId,
    }];
  });
}
