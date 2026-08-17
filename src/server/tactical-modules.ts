import type { TacticalModuleId } from "../shared/tactical-module-catalog";

export interface TacticalRuntimeModifiers {
  projectileSpeedMultiplier: number;
  projectileDistanceMultiplier: number;
  projectileRadiusMultiplier: number;
  damageMultiplier: number;
  fireCooldownMultiplier: number;
  shieldMultiplier: number;
  shieldMoveMultiplier: number;
  activeHealingMultiplier: number;
  selfHealingMultiplier: number;
  receivedHealingMultiplier: number;
  regenDelayAddMs: number;
  exclusiveCooldownMultiplier: number;
  exclusivePotencyMultiplier: number;
}

const NEUTRAL: Readonly<TacticalRuntimeModifiers> = {
  projectileSpeedMultiplier: 1,
  projectileDistanceMultiplier: 1,
  projectileRadiusMultiplier: 1,
  damageMultiplier: 1,
  fireCooldownMultiplier: 1,
  shieldMultiplier: 1,
  shieldMoveMultiplier: 1,
  activeHealingMultiplier: 1,
  selfHealingMultiplier: 1,
  receivedHealingMultiplier: 1,
  regenDelayAddMs: 0,
  exclusiveCooldownMultiplier: 1,
  exclusivePotencyMultiplier: 1,
};

export function neutralTacticalRuntimeModifiers(): TacticalRuntimeModifiers {
  return { ...NEUTRAL };
}

export function tacticalRuntimeModifiers(id: TacticalModuleId): TacticalRuntimeModifiers {
  if (id === "shield-reinforcement") {
    return { ...NEUTRAL, shieldMultiplier: 1.3, shieldMoveMultiplier: 0.93 };
  }
  if (id === "ballistic-acceleration") {
    return {
      ...NEUTRAL,
      projectileSpeedMultiplier: 1.18,
      projectileDistanceMultiplier: 0.88,
      projectileRadiusMultiplier: 0.9,
    };
  }
  if (id === "healing-amplifier") {
    return {
      ...NEUTRAL,
      activeHealingMultiplier: 1.22,
      selfHealingMultiplier: 1.1,
      receivedHealingMultiplier: 1.1,
      regenDelayAddMs: 750,
    };
  }
  return {
    ...NEUTRAL,
    exclusiveCooldownMultiplier: 0.85,
    exclusivePotencyMultiplier: 0.88,
  };
}
