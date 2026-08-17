import { distanceSquared, normalize } from "../shared/math";
import { zoneContainsPoint, type MapMechanicZone } from "../shared/map-mechanics";
import type { PlayerInput, Vec2 } from "../shared/protocol";
import { botDifficultyProfile, type BotDifficulty } from "../shared/bot-difficulty";
import type { GameWorld, WorldPlayer } from "./simulation";

const RETREAT_HEALTH = 35;
const RETREAT_DISTANCE_SQUARED = 500 * 500;
const FIRE_DISTANCE_SQUARED = 420 * 420;
const DASH_MIN_DISTANCE_SQUARED = 420 * 420;
const DASH_MAX_DISTANCE_SQUARED = 900 * 900;
const MOVE_INPUT_SCALE = 0.75;
const MAP_ZONE_HYSTERESIS = 48;
const CRYSTAL_SEEK_HEALTH_RATIO = 0.65;
const NEON_ROUTE_DETOUR_RATIO = 1.12;
const MAP_EVENT_SCAN_PAUSE_MS = 700;

export interface BotDecision {
  input: PlayerInput;
  useSkill: boolean;
  aimErrorRadians: number;
}

export function chooseBotDecision(
  world: GameWorld,
  playerId: string,
  random: () => number = Math.random,
  difficulty: BotDifficulty = "normal",
): BotDecision {
  const player = world.players.get(playerId);
  if (!player?.alive || world.phase === "finished") return { input: idleInput(player), useSkill: false, aimErrorRadians: 0 };
  const profile = botDifficultyProfile(difficulty);

  const enemy = selectCombatTarget(world, player);
  const energy = nearestPoint(player, [...world.energy.values()]);
  const skillOrb = nearestPoint(player, [...world.skillSystem.orbs.values()]);
  const capturePoint = world.capturePoint;
  const captureTarget = capturePoint ? world.capturePointConfig.center : null;
  const enemyDistance = enemy ? distanceSquared(player, enemy) : Number.POSITIVE_INFINITY;
  const energyDistance = energy ? distanceSquared(player, energy) : Number.POSITIVE_INFINITY;
  const eventResponse = activeMapEventResponse(world, player);
  const scanPause = shouldPauseForScan(world, player);
  const reactorEscape = activeDangerEscapeVector(world, player);
  const mapOpportunity = bestMapOpportunity(world, player, captureTarget ?? skillOrb ?? energy ?? enemy ?? null);

  let movement: Vec2 = { x: 0, y: 0 };
  if (eventResponse) {
    movement = eventResponse;
  } else if (reactorEscape) {
    movement = reactorEscape;
  } else if (scanPause) {
    movement = { x: 0, y: 0 };
  } else if (enemy && player.health <= RETREAT_HEALTH && enemyDistance <= RETREAT_DISTANCE_SQUARED) {
    movement = normalize({ x: player.x - enemy.x, y: player.y - enemy.y });
  } else if (mapOpportunity) {
    movement = mapOpportunity;
  } else if (captureTarget && capturePoint && capturePoint.ownerTeamId !== player.teamId && capturePoint.state !== "owned") {
    movement = normalize({ x: captureTarget.x - player.x, y: captureTarget.y - player.y });
  } else if (skillOrb) {
    movement = normalize({ x: skillOrb.x - player.x, y: skillOrb.y - player.y });
  } else if (energy && (!enemy || energyDistance < enemyDistance * 0.8)) {
    movement = normalize({ x: energy.x - player.x, y: energy.y - player.y });
  } else if (enemy) {
    movement = normalize({ x: enemy.x - player.x, y: enemy.y - player.y });
  }

  const aimErrorRadians = enemy ? (random() - 0.5) * profile.maxAimErrorRadians * 2 : 0;
  const aim = enemy ? aimWithError(player, enemy, aimErrorRadians) : movement;
  const heldSkill = player.skillSlot.charges === 1 ? player.skillSlot.type : null;
  const tacticalSkillWindow = heldSkill === "heal"
    ? player.health <= 45
    : heldSkill === "shield"
      ? Boolean(enemy && player.health <= 70 && enemyDistance <= RETREAT_DISTANCE_SQUARED)
      : heldSkill === "spread"
        ? Boolean(enemy && enemyDistance <= FIRE_DISTANCE_SQUARED)
        : heldSkill === "dash"
          ? Boolean(enemy && player.health > RETREAT_HEALTH && enemyDistance >= DASH_MIN_DISTANCE_SQUARED && enemyDistance <= DASH_MAX_DISTANCE_SQUARED)
          : false;
  const useSkill = tacticalSkillWindow && random() < profile.skillUseChance;

  if (useSkill && heldSkill === "dash" && enemy) {
    movement = normalize({ x: enemy.x - player.x, y: enemy.y - player.y });
  }

  return {
    useSkill,
    aimErrorRadians: Math.abs(aimErrorRadians),
    input: {
      seq: player.lastProcessedInput + 1,
      moveX: movement.x * MOVE_INPUT_SCALE,
      moveY: movement.y * MOVE_INPUT_SCALE,
      aimX: aim.x,
      aimY: aim.y,
      firing: Boolean(!scanPause && enemy && enemyDistance <= FIRE_DISTANCE_SQUARED * profile.fireRangeMultiplier ** 2),
    },
  };
}

function activeMapEventResponse(world: GameWorld, player: WorldPlayer): Vec2 | null {
  const state = world.mapEventState;
  if (!state || (state.phase !== "warning" && state.phase !== "active")) return null;

  if (state.kind === "area-lockdown" && state.zone && zoneContainsPoint(state.zone, player, MAP_ZONE_HYSTERESIS)) {
    return outwardVector(state.zone, player);
  }

  if (state.kind === "energy-storm" && state.zone && !zoneContainsPoint(state.zone, player)) {
    const center = zoneCenter(state.zone);
    return normalize({ x: center.x - player.x, y: center.y - player.y });
  }

  if (state.kind === "supply-drop" && state.point) {
    const storm = state.zone && !zoneContainsPoint(state.zone, player);
    if (!storm) return normalize({ x: state.point.x - player.x, y: state.point.y - player.y });
  }

  return null;
}

function shouldPauseForScan(world: GameWorld, player: WorldPlayer): boolean {
  const state = world.mapEventState;
  return Boolean(
    state?.kind === "global-scan" &&
    state.phase === "active" &&
    world.now - player.lastMapEventActivityAt < MAP_EVENT_SCAN_PAUSE_MS,
  );
}

export function selectCombatTarget(world: GameWorld, player: WorldPlayer): WorldPlayer | undefined {
  return nearestPlayer(player, [...world.players.values()].filter((candidate) =>
    candidate.id !== player.id
    && candidate.alive
    && (world.matchMode === "solo" || player.teamId == null || candidate.teamId !== player.teamId),
  ));
}

function activeDangerEscapeVector(world: GameWorld, player: WorldPlayer): Vec2 | null {
  const state = world.mapMechanicState;
  if (!state || state.definition.kind !== "reactor-vent" || (state.phase !== "warning" && state.phase !== "active")) return null;
  const zone = state.definition.zones[state.zoneIndex];
  if (!zone || !zoneContainsPoint(zone, player, MAP_ZONE_HYSTERESIS)) return null;
  return outwardVector(zone, player);
}

function bestMapOpportunity(world: GameWorld, player: WorldPlayer, routeTarget: Vec2 | null): Vec2 | null {
  const state = world.mapMechanicState;
  if (!state || state.phase !== "active") return null;
  const zone = state.definition.zones[state.zoneIndex];
  if (!zone) return null;

  if (state.definition.kind === "crystal-resonance") {
    const occupancy = [...world.players.values()].filter((candidate) => candidate.alive && zoneContainsPoint(zone, candidate));
    const allies = occupancy.filter((candidate) => isFriendly(world, player, candidate)).length;
    const enemies = occupancy.length - allies;
    if (zoneContainsPoint(zone, player, MAP_ZONE_HYSTERESIS) && enemies > allies) return outwardVector(zone, player);
    if (player.health / Math.max(1, player.maxHealth) <= CRYSTAL_SEEK_HEALTH_RATIO && enemies <= allies && !zoneContainsPoint(zone, player)) {
      const center = zoneCenter(zone);
      return normalize({ x: center.x - player.x, y: center.y - player.y });
    }
    return null;
  }

  if (state.definition.kind !== "neon-overdrive" || !routeTarget || zoneContainsPoint(zone, player)) return null;
  const entry = closestZoneEntry(zone, player);
  const directDistance = Math.sqrt(distanceSquared(player, routeTarget));
  const routedDistance = Math.sqrt(distanceSquared(player, entry)) + Math.sqrt(distanceSquared(entry, routeTarget));
  if (directDistance <= 0 || routedDistance > directDistance * NEON_ROUTE_DETOUR_RATIO) return null;
  return normalize({ x: entry.x - player.x, y: entry.y - player.y });
}

function isFriendly(world: GameWorld, player: WorldPlayer, candidate: WorldPlayer): boolean {
  if (candidate.id === player.id) return true;
  return world.matchMode !== "solo" && player.teamId !== null && candidate.teamId === player.teamId;
}

function zoneCenter(zone: MapMechanicZone): Vec2 {
  return zone.kind === "circle"
    ? { x: zone.x, y: zone.y }
    : { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
}

function outwardVector(zone: MapMechanicZone, player: Vec2): Vec2 {
  if (zone.kind === "circle") {
    const delta = { x: player.x - zone.x, y: player.y - zone.y };
    return delta.x === 0 && delta.y === 0 ? { x: 1, y: 0 } : normalize(delta);
  }
  const distances = [
    { distance: Math.abs(player.x - zone.x), vector: { x: -1, y: 0 } },
    { distance: Math.abs(zone.x + zone.width - player.x), vector: { x: 1, y: 0 } },
    { distance: Math.abs(player.y - zone.y), vector: { x: 0, y: -1 } },
    { distance: Math.abs(zone.y + zone.height - player.y), vector: { x: 0, y: 1 } },
  ];
  distances.sort((left, right) => left.distance - right.distance);
  return distances[0]!.vector;
}

function closestZoneEntry(zone: MapMechanicZone, player: Vec2): Vec2 {
  if (zone.kind === "circle") {
    const direction = normalize({ x: player.x - zone.x, y: player.y - zone.y });
    const safeDirection = direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : direction;
    return { x: zone.x + safeDirection.x * zone.radius * 0.72, y: zone.y + safeDirection.y * zone.radius * 0.72 };
  }
  const inset = Math.min(24, zone.width * 0.1, zone.height * 0.1);
  return {
    x: clamp(player.x, zone.x + inset, zone.x + zone.width - inset),
    y: clamp(player.y, zone.y + inset, zone.y + zone.height - inset),
  };
}

function idleInput(player: WorldPlayer | undefined): PlayerInput {
  return {
    seq: (player?.lastProcessedInput ?? 0) + 1,
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    firing: false,
  };
}

function nearestPlayer(origin: Vec2, players: WorldPlayer[]): WorldPlayer | undefined {
  return players.reduce<WorldPlayer | undefined>((nearest, candidate) => {
    if (!nearest) return candidate;
    return distanceSquared(origin, candidate) < distanceSquared(origin, nearest) ? candidate : nearest;
  }, undefined);
}

function nearestPoint<T extends Vec2>(origin: Vec2, points: T[]): T | undefined {
  return points.reduce<T | undefined>((nearest, candidate) => {
    if (!nearest) return candidate;
    return distanceSquared(origin, candidate) < distanceSquared(origin, nearest) ? candidate : nearest;
  }, undefined);
}

function aimWithError(origin: Vec2, target: Vec2, error: number): Vec2 {
  const perfectAngle = Math.atan2(target.y - origin.y, target.x - origin.x);
  return { x: Math.cos(perfectAngle + error), y: Math.sin(perfectAngle + error) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
