import {
  MAX_SKILL_ORBS,
  SKILL_ACTION_MAX_JUMP,
  SKILL_ORB_RADIUS,
  SKILL_ORB_SAFE_DISTANCE,
  SKILL_ORB_SPAWN_MAX_MS,
  SKILL_ORB_SPAWN_MIN_MS,
  SKILL_ORB_SPAWN_POINTS,
  WALLS,
} from "../shared/constants";
import { circleHitsRect, distanceSquared } from "../shared/math";
import { SKILL_TYPES, type SkillType } from "../shared/skill-catalog";
import type { Rect, SkillOrbSnapshot, SkillSlotSnapshot, Vec2 } from "../shared/protocol";

export interface SkillSystemState {
  orbs: Map<string, SkillOrbSnapshot>;
  nextOrbId: number;
  nextPoint: number;
  nextSpawnAt: number;
  lastSpawnAt: number;
  bag: SkillType[];
  random: () => number;
  spawnPoints: readonly Vec2[];
  walls: readonly Rect[];
}

export interface SkillHolder {
  skillSlot: SkillSlotSnapshot;
}

export interface SkillActionPlayer extends SkillHolder {
  lastProcessedSkillAction: number;
}

export const DASH_DISTANCE = 260;
export const SHIELD_STRENGTH = 50;
export const SHIELD_DURATION_MS = 5_000;
export const SPREAD_PROJECTILE_DAMAGE = 18;
export const SPREAD_ANGLE_RADIANS = 12 * Math.PI / 180;
export const HEAL_AMOUNT = 35;

export function createSkillSystem(now = 0, random: () => number = Math.random, spawnPoints: readonly Vec2[] = SKILL_ORB_SPAWN_POINTS, walls: readonly Rect[] = WALLS): SkillSystemState {
  return {
    orbs: new Map(),
    nextOrbId: 1,
    nextPoint: 0,
    nextSpawnAt: now + SKILL_ORB_SPAWN_MIN_MS,
    lastSpawnAt: now,
    bag: shuffledBag(random),
    random,
    spawnPoints,
    walls,
  };
}

export function seedInitialSkillOrbs(state: SkillSystemState, occupied: readonly Vec2[], count = 2): number {
  let spawned = 0;
  while (spawned < count && state.orbs.size < MAX_SKILL_ORBS && spawnSkillOrb(state, occupied)) spawned += 1;
  return spawned;
}

export function advanceSkillSystem(state: SkillSystemState, now: number, occupied: readonly Vec2[]): void {
  if (!Number.isFinite(now) || now < state.nextSpawnAt) return;
  if (state.orbs.size >= MAX_SKILL_ORBS) {
    state.nextSpawnAt = now + nextInterval(state.random);
    return;
  }

  while (now >= state.nextSpawnAt && state.orbs.size < MAX_SKILL_ORBS) {
    const scheduledAt = state.nextSpawnAt;
    if (!spawnSkillOrb(state, occupied)) {
      state.nextSpawnAt = now + nextInterval(state.random);
      return;
    }
    state.lastSpawnAt = scheduledAt;
    state.nextSpawnAt = scheduledAt + nextInterval(state.random);
  }
}

export function collectSkillOrb(state: SkillSystemState, holder: SkillHolder, orbId: string): boolean {
  const orb = state.orbs.get(orbId);
  if (!orb) return false;
  state.orbs.delete(orbId);
  holder.skillSlot = { type: orb.type, charges: 1 };
  return true;
}

export function clearSkillSlot(holder: SkillHolder): void {
  holder.skillSlot = { type: null, charges: 0 };
}

export function applySkillAction(
  player: SkillActionPlayer,
  skillActionSeq: number,
): { accepted: boolean; skill: SkillType | null } {
  const result = acceptSkillAction(player, skillActionSeq);
  if (result.skill) clearSkillSlot(player);
  return result;
}

export function acceptSkillAction(
  player: SkillActionPlayer,
  skillActionSeq: number,
): { accepted: boolean; skill: SkillType | null } {
  if (
    !Number.isSafeInteger(skillActionSeq) ||
    skillActionSeq < 0 ||
    skillActionSeq <= player.lastProcessedSkillAction ||
    skillActionSeq - player.lastProcessedSkillAction > SKILL_ACTION_MAX_JUMP
  ) {
    return { accepted: false, skill: null };
  }
  player.lastProcessedSkillAction = skillActionSeq;
  const skill = player.skillSlot.charges === 1 ? player.skillSlot.type : null;
  return { accepted: true, skill };
}

function spawnSkillOrb(state: SkillSystemState, occupied: readonly Vec2[]): boolean {
  for (let attempt = 0; attempt < state.spawnPoints.length; attempt += 1) {
    const point = state.spawnPoints[state.nextPoint++ % state.spawnPoints.length];
    if (!point || !isSafePoint(state, point, occupied)) continue;
    if (state.bag.length === 0) state.bag = shuffledBag(state.random);
    const type = state.bag.shift();
    if (!type) return false;
    const id = `skill-orb-${state.nextOrbId++}`;
    state.orbs.set(id, { id, type, x: point.x, y: point.y });
    return true;
  }
  return false;
}

function isSafePoint(state: SkillSystemState, point: Vec2, occupied: readonly Vec2[]): boolean {
  if (state.walls.some((wall) => circleHitsRect(point, SKILL_ORB_RADIUS, wall))) return false;
  const minDistanceSquared = SKILL_ORB_SAFE_DISTANCE * SKILL_ORB_SAFE_DISTANCE;
  if (occupied.some((candidate) => distanceSquared(candidate, point) < minDistanceSquared)) return false;
  return ![...state.orbs.values()].some((orb) => distanceSquared(orb, point) < minDistanceSquared);
}

function nextInterval(random: () => number): number {
  const unit = Math.min(1, Math.max(0, random()));
  return SKILL_ORB_SPAWN_MIN_MS + unit * (SKILL_ORB_SPAWN_MAX_MS - SKILL_ORB_SPAWN_MIN_MS);
}

function shuffledBag(random: () => number): SkillType[] {
  const bag = [...SKILL_TYPES];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.min(0.999999, Math.max(0, random())) * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex]!, bag[index]!];
  }
  return bag;
}
