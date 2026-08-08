import { firstWallHit } from "../shared/collision";
import { normalize } from "../shared/math";
import type { Rect, Vec2 } from "../shared/protocol";

export const AIM_GUIDE_LINE_WIDTH = 7;

export function calculateAimGuide(
  origin: Vec2,
  aim: Vec2,
  maxDistance: number,
  walls: readonly Rect[],
): { start: Vec2; end: Vec2; angle: number; length: number; visible: boolean } {
  const magnitude = Math.hypot(aim.x, aim.y);
  if (!Number.isFinite(maxDistance) || maxDistance <= 0 || magnitude < 0.15) {
    return { start: { ...origin }, end: { ...origin }, angle: 0, length: 0, visible: false };
  }
  const direction = normalize(aim);
  const delta = { x: direction.x * maxDistance, y: direction.y * maxDistance };
  const hit = firstWallHit(origin, delta, 0, walls);
  const length = maxDistance * (hit?.time ?? 1);
  return {
    start: { ...origin },
    end: { x: origin.x + direction.x * length, y: origin.y + direction.y * length },
    angle: Math.atan2(direction.y, direction.x),
    length,
    visible: true,
  };
}
