import type { Rect, Vec2 } from "./protocol";

export interface SweepHit {
  time: number;
  normal: Vec2;
}

const SKIN = 1e-6;

function expanded(rect: Rect, radius: number): Rect {
  return {
    x: rect.x - radius,
    y: rect.y - radius,
    width: rect.width + radius * 2,
    height: rect.height + radius * 2,
  };
}

function interiorNormal(point: Vec2, rect: Rect): Vec2 {
  const distances = [
    { distance: point.x - rect.x, normal: { x: -1, y: 0 } },
    { distance: rect.x + rect.width - point.x, normal: { x: 1, y: 0 } },
    { distance: point.y - rect.y, normal: { x: 0, y: -1 } },
    { distance: rect.y + rect.height - point.y, normal: { x: 0, y: 1 } },
  ];
  let nearest = distances[0]!;
  for (const candidate of distances.slice(1)) {
    if (candidate.distance < nearest.distance) nearest = candidate;
  }
  return nearest.normal;
}

/** Sweeps a circle by treating the target as an AABB expanded by its radius. */
export function sweepCircleRect(start: Vec2, delta: Vec2, radius: number, rect: Rect): SweepHit | null {
  const box = expanded(rect, radius);
  const inside = start.x >= box.x && start.x <= box.x + box.width && start.y >= box.y && start.y <= box.y + box.height;
  if (delta.x === 0 && delta.y === 0) {
    return inside ? { time: 0, normal: interiorNormal(start, box) } : null;
  }

  let enterX = Number.NEGATIVE_INFINITY;
  let exitX = Number.POSITIVE_INFINITY;
  let enterNormalX: Vec2 = { x: 0, y: 0 };
  if (delta.x === 0) {
    if (start.x < box.x || start.x > box.x + box.width) return null;
  } else {
    const t1 = (box.x - start.x) / delta.x;
    const t2 = (box.x + box.width - start.x) / delta.x;
    if (t1 <= t2) {
      enterX = t1;
      exitX = t2;
      enterNormalX = { x: -1, y: 0 };
    } else {
      enterX = t2;
      exitX = t1;
      enterNormalX = { x: 1, y: 0 };
    }
  }

  let enterY = Number.NEGATIVE_INFINITY;
  let exitY = Number.POSITIVE_INFINITY;
  let enterNormalY: Vec2 = { x: 0, y: 0 };
  if (delta.y === 0) {
    if (start.y < box.y || start.y > box.y + box.height) return null;
  } else {
    const t1 = (box.y - start.y) / delta.y;
    const t2 = (box.y + box.height - start.y) / delta.y;
    if (t1 <= t2) {
      enterY = t1;
      exitY = t2;
      enterNormalY = { x: 0, y: -1 };
    } else {
      enterY = t2;
      exitY = t1;
      enterNormalY = { x: 0, y: 1 };
    }
  }

  const enter = Math.max(enterX, enterY);
  const exit = Math.min(exitX, exitY);
  if (enter > exit || exit < 0 || enter > 1) return null;

  if (inside) return { time: 0, normal: interiorNormal(start, box) };
  const normal = enterX >= enterY ? enterNormalX : enterNormalY;
  return { time: Math.max(0, enter), normal };
}

export function firstWallHit(
  start: Vec2,
  delta: Vec2,
  radius: number,
  walls: readonly Rect[],
): (SweepHit & { wall: Rect }) | null {
  let nearest: (SweepHit & { wall: Rect }) | null = null;
  for (const wall of walls) {
    const hit = sweepCircleRect(start, delta, radius, wall);
    if (hit && (nearest === null || hit.time < nearest.time)) nearest = { ...hit, wall };
  }
  return nearest;
}

function depenetrate(position: Vec2, radius: number, walls: readonly Rect[]): Vec2 {
  let result = { ...position };
  for (let pass = 0; pass < walls.length + 1; pass += 1) {
    let moved = false;
    for (const wall of walls) {
      const box = expanded(wall, radius);
      if (result.x < box.x || result.x > box.x + box.width || result.y < box.y || result.y > box.y + box.height) continue;
      const normal = interiorNormal(result, box);
      if (normal.x !== 0) result = { x: result.x + normal.x * (Math.abs(normal.x === -1 ? result.x - box.x : box.x + box.width - result.x) + SKIN), y: result.y };
      else result = { x: result.x, y: result.y + normal.y * (Math.abs(normal.y === -1 ? result.y - box.y : box.y + box.height - result.y) + SKIN) };
      moved = true;
    }
    if (!moved) break;
  }
  return result;
}

export function moveCircleSafely(
  start: Vec2,
  delta: Vec2,
  radius: number,
  walls: readonly Rect[],
  bounds: { width: number; height: number },
): Vec2 {
  let position = depenetrate(start, radius, walls);
  const horizontal = { x: delta.x, y: 0 };
  if (horizontal.x !== 0) {
    const hit = firstWallHit(position, horizontal, radius, walls);
    if (hit) position = { x: position.x + horizontal.x * hit.time + hit.normal.x * SKIN, y: position.y };
    else position = { x: position.x + horizontal.x, y: position.y };
  }
  const vertical = { x: 0, y: delta.y };
  if (vertical.y !== 0) {
    const hit = firstWallHit(position, vertical, radius, walls);
    if (hit) position = { x: position.x, y: position.y + vertical.y * hit.time + hit.normal.y * SKIN };
    else position = { x: position.x, y: position.y + vertical.y };
  }

  const minX = radius;
  const maxX = Math.max(radius, bounds.width - radius);
  const minY = radius;
  const maxY = Math.max(radius, bounds.height - radius);
  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  };
}
