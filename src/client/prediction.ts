import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WALLS,
} from "../shared/constants";
import { circleHitsRect, clamp, normalize } from "../shared/math";
import type { Vec2 } from "../shared/protocol";

export function predictLocalPosition(position: Vec2, input: Vec2, deltaMs: number): Vec2 {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return { ...position };

  const direction = normalize({
    x: Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0,
    y: Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0,
  });
  const distance = PLAYER_SPEED * Math.min(deltaMs, 100) / 1_000;
  const next = { ...position };

  const nextX = clamp(next.x + direction.x * distance, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS);
  if (!WALLS.some((wall) => circleHitsRect({ x: nextX, y: next.y }, PLAYER_RADIUS, wall))) {
    next.x = nextX;
  }

  const nextY = clamp(next.y + direction.y * distance, PLAYER_RADIUS, ARENA_HEIGHT - PLAYER_RADIUS);
  if (!WALLS.some((wall) => circleHitsRect({ x: next.x, y: nextY }, PLAYER_RADIUS, wall))) {
    next.y = nextY;
  }

  return next;
}
