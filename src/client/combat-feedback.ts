import type { SkillType } from "../shared/skill-catalog";
import type { Vec2 } from "../shared/protocol";
import type { CombatEffectKind } from "./effect-pool";

export const PROJECTILE_VIEW_CAPACITY = 256;

const EFFECT_CAPACITIES: Readonly<Record<CombatEffectKind, number>> = {
  muzzle: 24,
  trail: 160,
  impact: 36,
  spark: 96,
  hit: 18,
  shield: 6,
  dash: 12,
  heal: 10,
  respawn: 8,
};

export function effectCapacity(kind: CombatEffectKind): number {
  return EFFECT_CAPACITIES[kind];
}

export interface TrailMemory extends Vec2 {
  emittedAt: number;
}

const TRAIL_DISTANCE = 14;

export function trailIntervalMs(lowPerformance: boolean): number {
  return lowPerformance ? 67 : 34;
}

export function projectileAngle(velocity: Vec2): number {
  return Math.atan2(velocity.y, velocity.x);
}

export function shouldEmitProjectileTrail(
  previous: TrailMemory,
  next: Vec2,
  now: number,
  lowPerformance: boolean,
): boolean {
  return now - previous.emittedAt >= trailIntervalMs(lowPerformance)
    && Math.hypot(next.x - previous.x, next.y - previous.y) >= TRAIL_DISTANCE;
}

export function didPickUpLocalSkill(
  previous: SkillType | null | undefined,
  next: SkillType | null,
): boolean {
  return previous === null && next !== null;
}
