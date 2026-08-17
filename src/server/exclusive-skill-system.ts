import { ARENA_HEIGHT, ARENA_WIDTH, PLAYER_RADIUS, WALLS, DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS } from "../shared/constants";
import type { CharacterId } from "../shared/character-catalog";
import { getExclusiveSkill, type ExclusiveSkillDefinition, type ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import type { Vec2 } from "../shared/protocol";
import { circleHitsRect, clamp, normalize } from "../shared/math";
import { resolveExclusiveSkillTargeting } from "../shared/exclusive-skill-targeting";
import type { Rect } from "../shared/protocol";

export interface ExclusiveSkillPlayer {
  id: string; characterId: CharacterId; x: number; y: number; angle: number; health: number; maxHealth: number; alive: boolean;
  teamId?: "red" | "blue" | "gold" | null; moveSpeed: number; fireCooldownMs: number; damage: number;
  exclusiveSkillCooldownMs?: number; exclusiveSkillReadyAt?: number;
  exclusivePotencyMultiplier?: number;
  exclusiveSkillState?: ExclusiveRuntimeState | null;
}
export interface ExclusiveRuntimeState { skillId: ExclusiveSkillId; startedAt: number; expiresAt: number; anchor?: Vec2; usedDash?: boolean; movementFrom?: Vec2; movementTarget?: Vec2; movementStartedAt?: number; movementEndsAt?: number; returning?: boolean; }
export type ExclusiveResult = { ok: true; definition: ExclusiveSkillDefinition; origin: Vec2; target: Vec2; state: ExclusiveRuntimeState | null } | { ok: false; error: string };
export interface ExclusiveSkillTargetingContext { walls: readonly Rect[]; bounds: { width: number; height: number }; playerRadius: number; }

const DEFAULT_TARGETING_CONTEXT: ExclusiveSkillTargetingContext = {
  walls: WALLS,
  bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
  playerRadius: PLAYER_RADIUS,
};

export function canUseExclusiveSkill(player: ExclusiveSkillPlayer, now: number): boolean {
  return player.alive && now >= (player.exclusiveSkillReadyAt ?? 0);
}

export function applyExclusiveSkill(
  player: ExclusiveSkillPlayer,
  now: number,
  direction: Vec2,
  targeting: ExclusiveSkillTargetingContext = DEFAULT_TARGETING_CONTEXT,
): ExclusiveResult {
  const definition = getExclusiveSkill(player.characterId);
  const potency = clamp(player.exclusivePotencyMultiplier ?? 1, 0.5, 1);
  if (definition.id === "breach" && player.exclusiveSkillState?.skillId === definition.id && player.exclusiveSkillState.anchor && now <= player.exclusiveSkillState.expiresAt) {
    const origin = { x: player.x, y: player.y };
    const target = player.exclusiveSkillState.anchor;
    if (!isSafePosition(target, targeting)) return { ok: false, error: "锚点位置已不安全" };
    const state: ExclusiveRuntimeState = {
      ...player.exclusiveSkillState,
      startedAt: now,
      expiresAt: now + (definition.balance.dashDurationMs ?? 180),
      movementFrom: origin,
      movementTarget: target,
      movementStartedAt: now,
      movementEndsAt: now + (definition.balance.dashDurationMs ?? 180),
      returning: true,
    };
    player.exclusiveSkillState = state;
    return { ok: true, definition, origin, target, state };
  }
  if (!canUseExclusiveSkill(player, now)) return { ok: false, error: "技能冷却中或角色已阵亡" };
  const directionLength = Math.hypot(direction.x, direction.y);
  const aim = directionLength > 0.08 ? normalize(direction) : { x: Math.cos(player.angle), y: Math.sin(player.angle) };
  const origin = { x: player.x, y: player.y };
  const resolvedTarget = isTeleport(definition.id)
    ? resolveExclusiveSkillTargeting({
        skillId: definition.id,
        origin,
        direction: aim,
        range: (definition.balance.dashDistance ?? 0) * potency,
        bounds: targeting.bounds,
        playerRadius: targeting.playerRadius,
        walls: targeting.walls,
      })
    : null;
  if (resolvedTarget && !resolvedTarget.valid) return { ok: false, error: "技能目标位置无效" };
  const cooldown = player.exclusiveSkillCooldownMs ?? DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS;
  player.exclusiveSkillReadyAt = now + clamp(cooldown, 1_000, 60_000);

  const target = resolvedTarget?.endpoint ?? origin;
  const state: ExclusiveRuntimeState = {
    skillId: definition.id,
    startedAt: now,
    expiresAt: now + Math.max(300, definition.balance.durationMs * potency),
    anchor: definition.id === "breach" ? origin : undefined,
    usedDash: false,
    movementFrom: definition.id === "breach" ? origin : undefined,
    movementTarget: definition.id === "breach" ? target : undefined,
    movementStartedAt: definition.id === "breach" ? now : undefined,
    movementEndsAt: definition.id === "breach" ? now + (definition.balance.dashDurationMs ?? 180) : undefined,
  };
  player.exclusiveSkillState = state;
  if (definition.id === "breach") {
    if (state) state.usedDash = true;
  } else if (definition.id === "phase-shift") {
    player.x = target.x; player.y = target.y;
  }
  return { ok: true, definition, origin, target, state };
}

export function advanceExclusiveSkillEffects(
  players: readonly ExclusiveSkillPlayer[],
  now: number,
): Array<{ playerId: string; state: ExclusiveRuntimeState }> {
  const ended: Array<{ playerId: string; state: ExclusiveRuntimeState }> = [];
  for (const player of players) {
    const state = player.exclusiveSkillState;
    if (!state || state.expiresAt <= 0 || now < state.expiresAt) continue;
    ended.push({ playerId: player.id, state });
    player.exclusiveSkillState = null;
  }
  return ended;
}

export function clearExclusiveSkillState(player: ExclusiveSkillPlayer): ExclusiveRuntimeState | null {
  const previous = player.exclusiveSkillState ?? null;
  player.exclusiveSkillState = null;
  return previous;
}

export function isExclusiveEffectActive(player: ExclusiveSkillPlayer, skillId: ExclusiveSkillId, now: number): boolean {
  return player.exclusiveSkillState?.skillId === skillId && now < player.exclusiveSkillState.expiresAt;
}

function isTeleport(id: ExclusiveSkillId): boolean { return id === "breach" || id === "phase-shift"; }
function isSafePosition(point: Vec2, targeting: ExclusiveSkillTargetingContext): boolean {
  return point.x >= targeting.playerRadius
    && point.x <= targeting.bounds.width - targeting.playerRadius
    && point.y >= targeting.playerRadius
    && point.y <= targeting.bounds.height - targeting.playerRadius
    && !targeting.walls.some((wall) => circleHitsRect(point, targeting.playerRadius, wall));
}
