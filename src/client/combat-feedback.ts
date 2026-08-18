import type { SkillType } from "../shared/skill-catalog";
import type { GameSnapshot, KillFeedEvent, PlayerSnapshot, Vec2 } from "../shared/protocol";
import type { CombatEffectKind } from "./effect-pool";

export const PROJECTILE_VIEW_CAPACITY = 256;

const EFFECT_CAPACITIES: Readonly<Record<CombatEffectKind, number>> = {
  muzzle: 24,
  trail: 160,
  impact: 36,
  spark: 96,
  hit: 18,
  shield: 6,
  dash: 12,
  heal: 10,
  respawn: 8,
};

export function effectCapacity(kind: CombatEffectKind): number {
  return EFFECT_CAPACITIES[kind];
}

export interface TrailMemory extends Vec2 {
  emittedAt: number;
}

const TRAIL_DISTANCE = 14;

export function trailIntervalMs(_lowPerformance: boolean): number {
  return 34;
}

export function shouldShowProjectileTrace(_lowPerformance: boolean): boolean {
  return true;
}

export function shouldRenderProjectileImageEffect(
  _kind: "muzzle" | "trail" | "impact" | "spark" | "smoke",
  _lowPerformance: boolean,
): boolean {
  return true;
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

export function selectLatestKillFeedback(
  feed: readonly KillFeedEvent[],
  localPlayerId: string | null,
  previousEventId: string,
  serverTime: number,
): { event: KillFeedEvent | null; streakToPlay: number | null } {
  const event = feed.at(-1) ?? null;
  if (!event) return { event: null, streakToPlay: null };
  const age = serverTime - event.at;
  const isNewRecentLocalKill = event.id !== previousEventId
    && event.killerId === localPlayerId
    && age >= 0
    && age <= 2_000;
  return { event, streakToPlay: isNewRecentLocalKill ? event.streak : null };
}

export function shouldUseLocalAttackFeedback(snapshot: GameSnapshot, ownerId: string, localPlayerId: string | null): boolean {
  if (ownerId !== localPlayerId) return false;
  return snapshot.players.find((player) => player.id === localPlayerId)?.alive === true;
}

export type CombatFeedbackEventType = "hurt" | "low-health" | "death" | "kill";

export interface CombatFeedbackEvent {
  type: CombatFeedbackEventType;
  key: string;
  at: number;
  sourceId?: string;
  streak?: number;
}

export function selectCombatFeedbackEvents(
  previous: GameSnapshot | null,
  next: GameSnapshot,
  localPlayerId: string | null,
): CombatFeedbackEvent[] {
  if (!previous || !localPlayerId) return [];
  const before = previous.players.find((player) => player.id === localPlayerId);
  const after = next.players.find((player) => player.id === localPlayerId);
  if (!before || !after) return [];
  const events: CombatFeedbackEvent[] = [];
  if (after.alive && ((after.lastDamagedAt ?? -1) > (before.lastDamagedAt ?? -1) || after.health < before.health)) {
    events.push({ type: "hurt", key: `hurt:${after.lastDamagedAt ?? next.serverTime}`, at: next.serverTime, sourceId: after.lastDamageSourceId ?? undefined });
  }
  const beforeLow = before.health > before.maxHealth * 0.3;
  const afterLow = after.health > 0 && after.health <= after.maxHealth * 0.3;
  if (beforeLow && afterLow) events.push({ type: "low-health", key: `low-health:${next.serverTime}`, at: next.serverTime });
  if (before.alive && !after.alive) events.push({ type: "death", key: `death:${after.respawnAt ?? next.serverTime}`, at: next.serverTime });
  const previousKillId = previous.killFeed?.at(-1)?.id;
  const kill = next.killFeed?.at(-1);
  if (kill && kill.id !== previousKillId && kill.killerId === localPlayerId) {
    events.push({ type: "kill", key: `kill:${kill.id}`, at: kill.at, sourceId: kill.victimId, streak: kill.streak });
  }
  return events;
}
