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

/** Sweeps a moving circle against a stationary circle using relative motion. */
export function sweepCircleCircle(
  start: Vec2,
  delta: Vec2,
  radius: number,
  target: Vec2,
  targetRadius: number,
): SweepHit | null {
  const relative = { x: start.x - target.x, y: start.y - target.y };
  const combinedRadius = radius + targetRadius;
  const c = relative.x * relative.x + relative.y * relative.y - combinedRadius * combinedRadius;
  if (c <= 0) {
    const length = Math.hypot(relative.x, relative.y);
    return {
      time: 0,
      normal: length > SKIN ? { x: relative.x / length, y: relative.y / length } : { x: -1, y: 0 },
    };
  }

  const a = delta.x * delta.x + delta.y * delta.y;
  if (a === 0) return null;
  const b = 2 * (relative.x * delta.x + relative.y * delta.y);
  const discriminant = b * b - 4 * a * c;
  const discriminantTolerance = Number.EPSILON * Math.max(1, b * b, Math.abs(4 * a * c));
  if (discriminant < -discriminantTolerance) return null;

  const root = Math.sqrt(Math.max(0, discriminant));
  const time = (-b - root) / (2 * a);
  if (time < 0 || time > 1) return null;

  const impact = { x: start.x + delta.x * time - target.x, y: start.y + delta.y * time - target.y };
  const impactLength = Math.hypot(impact.x, impact.y);
  return {
    time,
    normal: impactLength > SKIN ? { x: impact.x / impactLength, y: impact.y / impactLength } : { x: -1, y: 0 },
  };
}

function clampToBounds(position: Vec2, radius: number, bounds: { width: number; height: number }): Vec2 {
  const minX = radius;
  const maxX = Math.max(radius, bounds.width - radius);
  const minY = radius;
  const maxY = Math.max(radius, bounds.height - radius);
  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  };
}

function depenetrate(
  position: Vec2,
  radius: number,
  walls: readonly Rect[],
  bounds: { width: number; height: number },
): Vec2 {
  let result = clampToBounds(position, radius, bounds);
  const bounded = (candidate: Vec2): boolean => {
    const clamped = clampToBounds(candidate, radius, bounds);
    return clamped.x === candidate.x && clamped.y === candidate.y;
  };
  for (let pass = 0; pass < walls.length + 1; pass += 1) {
    let moved = false;
    for (const wall of walls) {
      const box = expanded(wall, radius);
      if (result.x < box.x || result.x > box.x + box.width || result.y < box.y || result.y > box.y + box.height) continue;
      const candidates = [
        { x: box.x - SKIN, y: result.y },
        { x: box.x + box.width + SKIN, y: result.y },
        { x: result.x, y: box.y - SKIN },
        { x: result.x, y: box.y + box.height + SKIN },
      ].filter(bounded);
      if (candidates.length === 0) continue;
      let nearest = candidates[0]!;
      let nearestDistance = (nearest.x - result.x) ** 2 + (nearest.y - result.y) ** 2;
      for (const candidate of candidates.slice(1)) {
        const distance = (candidate.x - result.x) ** 2 + (candidate.y - result.y) ** 2;
        if (distance < nearestDistance) {
          nearest = candidate;
          nearestDistance = distance;
        }
      }
      result = nearest;
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
  let position = depenetrate(start, radius, walls, bounds);
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

  position = clampToBounds(position, radius, bounds);
  return depenetrate(position, radius, walls, bounds);
}

export interface CircleObstacle {
  position: Vec2;
  radius: number;
}

/** Moves along one continuous segment and stops at the first blocking surface. */
export function moveCircleUntilBlocked(
  start: Vec2,
  delta: Vec2,
  radius: number,
  walls: readonly Rect[],
  bounds: { width: number; height: number },
  obstacles: readonly CircleObstacle[] = [],
): Vec2 {
  const origin = depenetrate(start, radius, walls, bounds);
  let nearestTime = 1;
  let nearestNormal: Vec2 | null = null;

  const wallHit = firstWallHit(origin, delta, radius, walls);
  if (wallHit && wallHit.time < nearestTime) {
    nearestTime = wallHit.time;
    nearestNormal = wallHit.normal;
  }

  for (const obstacle of obstacles) {
    const hit = sweepCircleCircle(origin, delta, radius, obstacle.position, obstacle.radius);
    if (hit && hit.time < nearestTime) {
      nearestTime = hit.time;
      nearestNormal = hit.normal;
    }
  }

  const boundaryTimes = [
    delta.x > 0 ? (bounds.width - radius - origin.x) / delta.x : Number.POSITIVE_INFINITY,
    delta.x < 0 ? (radius - origin.x) / delta.x : Number.POSITIVE_INFINITY,
    delta.y > 0 ? (bounds.height - radius - origin.y) / delta.y : Number.POSITIVE_INFINITY,
    delta.y < 0 ? (radius - origin.y) / delta.y : Number.POSITIVE_INFINITY,
  ].filter((time) => time >= 0 && time < nearestTime);
  if (boundaryTimes.length > 0) {
    nearestTime = Math.min(...boundaryTimes);
    nearestNormal = null;
  }

  const result = {
    x: origin.x + delta.x * nearestTime + (nearestNormal?.x ?? 0) * SKIN,
    y: origin.y + delta.y * nearestTime + (nearestNormal?.y ?? 0) * SKIN,
  };
  return clampToBounds(result, radius, bounds);
}
