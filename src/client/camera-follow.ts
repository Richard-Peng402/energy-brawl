import type { Rect, Vec2 } from "../shared/protocol";

export interface CameraSize {
  width: number;
  height: number;
}

export interface CameraView {
  center: Vec2;
  bounds: Rect;
}

export function resolveCameraView(target: Vec2, viewport: CameraSize, arena: CameraSize): CameraView {
  const viewportWidth = Math.max(0, viewport.width);
  const viewportHeight = Math.max(0, viewport.height);
  const arenaWidth = Math.max(0, arena.width);
  const arenaHeight = Math.max(0, arena.height);
  const halfWidth = viewportWidth / 2;
  const halfHeight = viewportHeight / 2;

  return {
    center: {
      x: clamp(target.x, 0, arenaWidth),
      y: clamp(target.y, 0, arenaHeight),
    },
    bounds: {
      x: -halfWidth,
      y: -halfHeight,
      width: arenaWidth + viewportWidth,
      height: arenaHeight + viewportHeight,
    },
  };
}

export function shouldSnapCameraOnRespawn(wasAlive: boolean, alive: boolean): boolean {
  return !wasAlive && alive;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
