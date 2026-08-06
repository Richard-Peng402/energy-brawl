import type { Vec2 } from "../shared/protocol";

export interface CameraFollowOptions {
  viewportWidth: number;
  viewportHeight: number;
  arenaWidth: number;
  arenaHeight: number;
  deadzoneWidth: number;
  deadzoneHeight: number;
  smoothing: number;
}

export function advanceCameraFollow(current: Vec2, target: Vec2, options: CameraFollowOptions, deltaMs: number): Vec2 {
  const halfViewportWidth = Math.max(0, options.viewportWidth / 2);
  const halfViewportHeight = Math.max(0, options.viewportHeight / 2);
  const desired = { x: current.x, y: current.y };
  const halfDeadzoneWidth = Math.max(0, options.deadzoneWidth / 2);
  const halfDeadzoneHeight = Math.max(0, options.deadzoneHeight / 2);

  if (target.x < current.x - halfDeadzoneWidth) desired.x = target.x + halfDeadzoneWidth;
  if (target.x > current.x + halfDeadzoneWidth) desired.x = target.x - halfDeadzoneWidth;
  if (target.y < current.y - halfDeadzoneHeight) desired.y = target.y + halfDeadzoneHeight;
  if (target.y > current.y + halfDeadzoneHeight) desired.y = target.y - halfDeadzoneHeight;

  const alpha = 1 - Math.exp(-Math.max(0, options.smoothing) * Math.max(0, deltaMs) / 1_000);
  const unclamped = {
    x: current.x + (desired.x - current.x) * alpha,
    y: current.y + (desired.y - current.y) * alpha,
  };
  return {
    x: clamp(unclamped.x, halfViewportWidth, Math.max(halfViewportWidth, options.arenaWidth - halfViewportWidth)),
    y: clamp(unclamped.y, halfViewportHeight, Math.max(halfViewportHeight, options.arenaHeight - halfViewportHeight)),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
