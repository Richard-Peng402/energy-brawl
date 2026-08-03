import type { Rect, Vec2 } from "./protocol";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function length(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

export function normalize(vector: Vec2): Vec2 {
  const magnitude = length(vector);
  if (magnitude === 0) return { x: 0, y: 0 };
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function circleHitsRect(center: Vec2, radius: number, rect: Rect): boolean {
  const closestX = clamp(center.x, rect.x, rect.x + rect.width);
  const closestY = clamp(center.y, rect.y, rect.y + rect.height);
  return distanceSquared(center, { x: closestX, y: closestY }) <= radius * radius;
}

export function circleHitsCircle(a: Vec2, aRadius: number, b: Vec2, bRadius: number): boolean {
  const radius = aRadius + bRadius;
  return distanceSquared(a, b) <= radius * radius;
}
