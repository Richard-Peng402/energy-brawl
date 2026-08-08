import { ARENA_HEIGHT, ARENA_WIDTH, PLAYER_RADIUS, WALLS, DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS } from "../shared/constants";
import type { CharacterId } from "../shared/character-catalog";
import { getExclusiveSkill, type ExclusiveSkillDefinition, type ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import type { Vec2 } from "../shared/protocol";
import { circleHitsRect, clamp, normalize } from "../shared/math";

export interface ExclusiveSkillPlayer {
  id: string; characterId: CharacterId; x: number; y: number; angle: number; health: number; maxHealth: number; alive: boolean;
  teamId?: "red" | "blue" | "gold" | null; moveSpeed: number; fireCooldownMs: number; damage: number;
  exclusiveSkillCooldownMs?: number; exclusiveSkillReadyAt?: number;
  exclusiveSkillState?: ExclusiveRuntimeState | null;
}
export interface ExclusiveRuntimeState { skillId: ExclusiveSkillId; startedAt: number; expiresAt: number; anchor?: Vec2; usedDash?: boolean; }
export type ExclusiveResult = { ok: true; definition: ExclusiveSkillDefinition; origin: Vec2; target: Vec2; state: ExclusiveRuntimeState | null } | { ok: false; error: string };

export function canUseExclusiveSkill(player: ExclusiveSkillPlayer, now: number): boolean {
  return player.alive && now >= (player.exclusiveSkillReadyAt ?? 0);
}

export function applyExclusiveSkill(player: ExclusiveSkillPlayer, now: number, direction: Vec2): ExclusiveResult {
  const definition = getExclusiveSkill(player.characterId);
  if (definition.id === "breach" && player.exclusiveSkillState?.skillId === definition.id && player.exclusiveSkillState.anchor && now <= player.exclusiveSkillState.expiresAt) {
    const origin = { x: player.x, y: player.y };
    const target = player.exclusiveSkillState.anchor;
    if (!isSafePosition(target)) return { ok: false, error: "锚点位置已不安全" };
    player.x = target.x; player.y = target.y; player.exclusiveSkillState = null;
    return { ok: true, definition, origin, target, state: null };
  }
  if (!canUseExclusiveSkill(player, now)) return { ok: false, error: "技能冷却中或角色已阵亡" };
  const directionLength = Math.hypot(direction.x, direction.y);
  const aim = directionLength > 0.08 ? normalize(direction) : { x: Math.cos(player.angle), y: Math.sin(player.angle) };
  const origin = { x: player.x, y: player.y };
  const cooldown = player.exclusiveSkillCooldownMs ?? DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS;
  player.exclusiveSkillReadyAt = now + clamp(cooldown, 1_000, 60_000);

  const target = isTeleport(definition.id) ? safeTarget(player, aim, definition.id === "phase-shift" ? 420 : 360) : origin;
  const state: ExclusiveRuntimeState | null = definition.durationMs > 0 || definition.id === "breach"
    ? { skillId: definition.id, startedAt: now, expiresAt: now + definition.durationMs, anchor: definition.id === "breach" ? origin : undefined, usedDash: false }
    : null;
  player.exclusiveSkillState = state;
  if (definition.id === "breach") {
    player.x = target.x; player.y = target.y;
    if (state) state.usedDash = true;
  } else if (definition.id === "phase-shift") {
    player.x = target.x; player.y = target.y;
  } else if (definition.id === "pulse-heal") {
    player.health = Math.min(player.maxHealth, player.health + 24);
  }
  return { ok: true, definition, origin, target, state };
}

export function advanceExclusiveSkillEffects(players: readonly ExclusiveSkillPlayer[], now: number): void {
  for (const player of players) if (player.exclusiveSkillState && player.exclusiveSkillState.expiresAt > 0 && now >= player.exclusiveSkillState.expiresAt) player.exclusiveSkillState = null;
}

export function clearExclusiveSkillState(player: ExclusiveSkillPlayer): void { player.exclusiveSkillState = null; }

export function isExclusiveEffectActive(player: ExclusiveSkillPlayer, skillId: ExclusiveSkillId, now: number): boolean {
  return player.exclusiveSkillState?.skillId === skillId && now < player.exclusiveSkillState.expiresAt;
}

function isTeleport(id: ExclusiveSkillId): boolean { return id === "breach" || id === "phase-shift"; }
function safeTarget(player: ExclusiveSkillPlayer, direction: Vec2, distance: number): Vec2 {
  const target = { x: player.x + direction.x * distance, y: player.y + direction.y * distance };
  if (isSafePosition(target)) return target;
  return { x: player.x, y: player.y };
}
function isSafePosition(point: Vec2): boolean {
  return point.x >= PLAYER_RADIUS && point.x <= ARENA_WIDTH - PLAYER_RADIUS && point.y >= PLAYER_RADIUS && point.y <= ARENA_HEIGHT - PLAYER_RADIUS && !WALLS.some((wall) => circleHitsRect(point, PLAYER_RADIUS, wall));
}
