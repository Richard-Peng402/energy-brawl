import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WALLS,
} from "../shared/constants";
import { moveCircleSafely } from "../shared/collision";
import { StaticSpatialIndex } from "../shared/spatial-index";
import { clamp, normalize } from "../shared/math";
import type { Vec2 } from "../shared/protocol";

const WALL_INDEX = new StaticSpatialIndex(WALLS);

export function predictLocalPosition(position: Vec2, input: Vec2, deltaMs: number, moveSpeed = PLAYER_SPEED): Vec2 {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return { ...position };

  const direction = normalize({
    x: Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0,
    y: Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0,
  });
  const distance = moveSpeed * deltaMs / 1_000;
  const delta = { x: direction.x * distance, y: direction.y * distance };
  const minX = Math.min(position.x, position.x + delta.x) - PLAYER_RADIUS;
  const minY = Math.min(position.y, position.y + delta.y) - PLAYER_RADIUS;
  const walls = WALL_INDEX.query({
    x: minX,
    y: minY,
    width: Math.abs(delta.x) + PLAYER_RADIUS * 2,
    height: Math.abs(delta.y) + PLAYER_RADIUS * 2,
  });
  return moveCircleSafely(
    position,
    delta,
    PLAYER_RADIUS,
    walls,
    { width: ARENA_WIDTH, height: ARENA_HEIGHT },
  );
}
