import type { SkillType } from "../shared/skill-catalog";
import type { Vec2 } from "../shared/protocol";

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
