import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COMBAT_REGEN_DELAY_MS,
  COMBAT_REGEN_PER_SECOND,
  DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS,
  ENERGY_RADIUS,
  ENERGY_RESPAWN_MS,
  ENERGY_SCORE,
  ENERGY_SPAWN_POINTS,
  HOLD_DURATION_MS,
  HOLDER_KILL_BONUS,
  KILL_SCORE,
  MATCH_DURATION_MS,
  MAX_ENERGY,
  MIN_DAMAGE,
  PLAYER_RADIUS,
  PROJECTILE_MAX_DISTANCE,
  PROJECTILE_RADIUS,
  RESPAWN_DELAY_MS,
  SKILL_ORB_RADIUS,
  SPAWN_POINTS,
  SPAWN_SHIELD_MS,
  TARGET_SCORE,
  WALLS,
} from "../shared/constants";
import { getCharacter, MEDIC_ENERGY_HEAL, type CharacterId } from "../shared/character-catalog";
import { getMapDefinition, type MapId } from "../shared/map-catalog";
import { MAP_MECHANICS, zoneContainsPoint } from "../shared/map-mechanics";
import { getModeDefinition, isCaptureMode, TEAM_IDS, type MatchMode, type TeamId } from "../shared/mode-catalog";
import { advanceCapturePoint, createCapturePointState, DEFAULT_CAPTURE_POINT_CONFIG, isCapturePointComplete, type CapturePointState } from "../shared/capture-point";
import { applyExclusiveSkill, advanceExclusiveSkillEffects, clearExclusiveSkillState, isExclusiveEffectActive, type ExclusiveRuntimeState } from "./exclusive-skill-system";
import { addStatusEffect, clearAllStatusEffects, clearPurifiableStatus, expireStatusEffects, hasActiveStatusEffect, type StatusEffectStore } from "./status-effects";
import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import type { SkillType } from "../shared/skill-catalog";
import { firstWallHit, moveCircleSafely, moveCircleUntilBlocked, sweepCircleCircle } from "../shared/collision";
import { StaticSpatialIndex } from "../shared/spatial-index";
import { circleHitsCircle, circleHitsRect, clamp, distanceSquared, normalize } from "../shared/math";
import { selectMatchMvp } from "../shared/match-results";
import { defaultTacticalModuleForCharacter, type TacticalModuleId } from "../shared/tactical-module-catalog";
import {
  advanceSkillSystem,
  acceptSkillAction,
  clearSkillSlot,
  collectSkillOrb,
  createSkillSystem,
  DASH_DISTANCE,
  HEAL_AMOUNT,
  SHIELD_DURATION_MS,
  SHIELD_STRENGTH,
  SPREAD_ANGLE_RADIANS,
  SPREAD_PROJECTILE_DAMAGE,
  seedInitialSkillOrbs,
  type SkillSystemState,
} from "./skill-system";
import type {
  AdminStats,
  EnergySnapshot,
  ExclusiveSkillEvent,
  GamePhase,
  GameSnapshot,
  KillFeedEvent,
  MapMechanicContribution,
  PlayerInput,
  PlayerSnapshot,
  ProjectileImpactEvent,
  ProjectileSnapshot,
  Vec2,
} from "../shared/protocol";
import {
  advanceMapMechanicState,
  createMapMechanicState,
  mapMechanicSnapshot,
  updateCrystalParticipant,
  updateReactorEscapeParticipant,
  type MapMechanicState,
} from "./map-mechanic-system";
import { appendPresentationEvent } from "./presentation-events";
import { neutralTacticalRuntimeModifiers, tacticalRuntimeModifiers } from "./tactical-modules";
import {
  advanceMapEventState,
  createMapEventState,
  mapEventSnapshot,
  type MapEventState,
} from "./map-event-system";
import {
  advanceHighlightTracker,
  createMatchHighlightTracker,
  finalizeMatchHighlights,
  recordCaptureScore,
  recordFiveKillStreak,
  recordHazardEscape,
  recordHealingCandidate,
  type MatchHighlightTracker,
} from "./match-highlight-tracker";
import type { MatchHighlight } from "../shared/match-highlights";
import { createEliminationState, type EliminationState } from "./team-elimination";

const EXCLUSIVE_SKILL_EVENT_CAPACITY = 24;
const PROJECTILE_IMPACT_EVENT_CAPACITY = 32;
const BULWARK_ALLY_PROTECTION_RADIUS = 190;
const BULWARK_SUPPRESSION_RADIUS = 240;
const BULWARK_PRESENTATION_LENGTH = 120;

export interface PlayerSeed {
  id: string;
  nickname: string;
  characterId: CharacterId;
  tacticalModuleId?: TacticalModuleId;
  isBot: boolean;
  stats?: Partial<AdminStats>;
  teamId?: TeamId | null;
}

export interface WorldPlayer extends PlayerSnapshot {
  input: PlayerInput;
  nextFireAt: number;
  lastCombatAt: number;
  regenAccumulatorMs: number;
  mapHealingAccumulatorMs: number;
  killStreak: number;
  exclusiveSkillState?: ExclusiveRuntimeState | null;
  recentDamageSources: Map<string, number>;
  statusEffects: StatusEffectStore;
  projectileMaxDistance: number;
  projectileRadius: number;
  shieldStrengthMultiplier: number;
  shieldMoveMultiplier: number;
  selfHealingMultiplier: number;
  activeHealingMultiplier: number;
  receivedHealingMultiplier: number;
  regenDelayAddMs: number;
  exclusivePotencyMultiplier: number;
  lastMapEventActivityAt: number;
  mapEventMoveMultiplier: number;
}

export interface WorldProjectile extends ProjectileSnapshot {
  distanceTraveled: number;
  damage?: number;
  maxDistance?: number;
  radius?: number;
}

export interface GameWorld {
  now: number;
  phase: Exclude<GamePhase, "lobby">;
  remainingMs: number;
  overtimePlayerIds: string[];
  winnerIds: string[];
  holderId: string | null;
  holdRemainingMs: number | null;
  finishedAt: number | null;
  matchMvpId: string | null;
  matchMvpScore: number | null;
  matchHighlightTracker: MatchHighlightTracker;
  matchHighlights: MatchHighlight[];
  players: Map<string, WorldPlayer>;
  projectiles: Map<string, WorldProjectile>;
  energy: Map<string, EnergySnapshot>;
  skillSystem: SkillSystemState;
  nextProjectileId: number;
  nextEnergyId: number;
  nextEnergySpawnAt: number;
  nextEnergyPoint: number;
  killFeed: KillFeedEvent[];
  nextKillFeedId: number;
  nextExclusiveSkillEventSeq: number;
  exclusiveSkillEvents: ExclusiveSkillEvent[];
  nextProjectileImpactEventSeq: number;
  projectileImpactEvents: ProjectileImpactEvent[];
  matchMode: MatchMode;
  teamScores: Map<TeamId, number>;
  captureScores: Map<TeamId, number>;
  capturePoint: CapturePointState | null;
  capturePointConfig: Readonly<typeof DEFAULT_CAPTURE_POINT_CONFIG>;
  mapId: MapId;
  mapWalls: StaticSpatialIndex;
  mapSpawnPoints: readonly Vec2[];
  mapEnergySpawnPoints: readonly Vec2[];
  mapMechanicsEnabled: boolean;
  mapMechanicState: MapMechanicState | null;
  mapEventsEnabled: boolean;
  mapEventState: MapEventState | null;
  eliminationState: EliminationState | null;
}

export interface CreateGameWorldOptions {
  mapMechanicsEnabled?: boolean;
  mapEventsEnabled?: boolean;
  mapEventSeed?: number;
}

const EMPTY_INPUT: PlayerInput = {
  seq: 0,
  moveX: 0,
  moveY: 0,
  aimX: 1,
  aimY: 0,
  firing: false,
};

function createMapMechanicContribution(): MapMechanicContribution {
  return {
    reactorEscapes: 0,
    neonDamage: 0,
    crystalResonances: 0,
    mechanicHealing: 0,
    mechanicEliminations: 0,
  };
}

export function createGameWorld(
  seeds: readonly PlayerSeed[],
  now = 0,
  matchMode: MatchMode = "solo",
  mapId: MapId = "reactor-core",
  options: CreateGameWorldOptions = {},
): GameWorld {
  const map = getMapDefinition(mapId);
  const mapMechanicsEnabled = options.mapMechanicsEnabled ?? true;
  const mapWalls = new StaticSpatialIndex(map.walls);
  const spawnPoints = map.spawnPointsByMode?.[matchMode] ?? map.spawnPoints;
  const players = new Map<string, WorldPlayer>();
  seeds.forEach((seed, index) => {
    const character = getCharacter(seed.characterId);
    const tacticalModuleId = seed.tacticalModuleId ?? defaultTacticalModuleForCharacter(seed.characterId);
    const tactical = seed.tacticalModuleId
      ? tacticalRuntimeModifiers(seed.tacticalModuleId)
      : neutralTacticalRuntimeModifiers();
    const spawn = spawnPoints[index % spawnPoints.length] ?? { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    const maxHealth = Math.max(seed.stats?.maxHealth ?? character.maxHealth, seed.stats?.health ?? 0);
    const health = Math.min(seed.stats?.health ?? maxHealth, maxHealth);
    players.set(seed.id, {
      id: seed.id,
      nickname: seed.nickname,
      characterId: seed.characterId,
      tacticalModuleId,
      isBot: seed.isBot,
      color: character.color,
      connected: !seed.isBot,
      ready: true,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      angle: 0,
      health,
      maxHealth,
      damage: seed.stats?.damage ?? character.damage,
      moveSpeed: seed.stats?.moveSpeed ?? character.moveSpeed,
      fireCooldownMs: seed.stats?.fireCooldownMs ?? character.fireCooldownMs,
      projectileSpeed: (seed.stats?.projectileSpeed ?? character.projectileSpeed) * tactical.projectileSpeedMultiplier,
      score: seed.stats?.score ?? 0,
      kills: seed.stats?.kills ?? 0,
      energyCollected: seed.stats?.energyCollected ?? 0,
      assists: 0,
      deaths: 0,
      damageDealt: 0,
      healingDone: 0,
      damageTaken: 0,
      skillContribution: 0,
      mapMechanicContribution: createMapMechanicContribution(),
      lastDamageSourceId: null,
      lastDamagedAt: null,
      alive: true,
      respawnAt: null,
      shieldUntil: now + SPAWN_SHIELD_MS,
      skillShieldHealth: 0,
      skillShieldUntil: 0,
      lastProcessedInput: 0,
      skillSlot: { type: null, charges: 0 },
      lastProcessedSkillAction: 0,
      lastProcessedExclusiveSkillAction: 0,
      input: { ...EMPTY_INPUT },
      nextFireAt: now,
      lastCombatAt: now,
      regenAccumulatorMs: 0,
      mapHealingAccumulatorMs: 0,
      killStreak: 0,
      teamId: seed.teamId ?? null,
      exclusiveSkillCooldownMs: (seed.stats?.exclusiveSkillCooldownMs ?? DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS) * tactical.exclusiveCooldownMultiplier,
      exclusiveSkillReadyAt: now,
      exclusiveSkillState: null,
      recentDamageSources: new Map(),
      statusEffects: new Map(),
      projectileMaxDistance: PROJECTILE_MAX_DISTANCE * tactical.projectileDistanceMultiplier,
      projectileRadius: PROJECTILE_RADIUS * tactical.projectileRadiusMultiplier,
      shieldStrengthMultiplier: tactical.shieldMultiplier,
      shieldMoveMultiplier: tactical.shieldMoveMultiplier,
      selfHealingMultiplier: tactical.selfHealingMultiplier,
      activeHealingMultiplier: tactical.activeHealingMultiplier,
      receivedHealingMultiplier: tactical.receivedHealingMultiplier,
      regenDelayAddMs: tactical.regenDelayAddMs,
      exclusivePotencyMultiplier: tactical.exclusivePotencyMultiplier,
      lastMapEventActivityAt: Number.NEGATIVE_INFINITY,
      mapEventMoveMultiplier: 1,
    });
  });

  const world: GameWorld = {
    now,
    phase: "playing",
    remainingMs: MATCH_DURATION_MS,
    overtimePlayerIds: [],
    winnerIds: [],
    holderId: null,
    holdRemainingMs: null,
    finishedAt: null,
    matchMvpId: null,
    matchMvpScore: null,
    matchHighlightTracker: createMatchHighlightTracker(),
    matchHighlights: [],
    players,
    projectiles: new Map(),
    energy: new Map(),
    skillSystem: createSkillSystem(now, Math.random, map.skillOrbSpawnPoints, map.walls),
    nextProjectileId: 1,
    nextEnergyId: 1,
    nextEnergySpawnAt: now,
    nextEnergyPoint: 0,
    killFeed: [],
    nextKillFeedId: 1,
    nextExclusiveSkillEventSeq: 1,
    exclusiveSkillEvents: [],
    nextProjectileImpactEventSeq: 1,
    projectileImpactEvents: [],
    matchMode,
    teamScores: new Map(
      TEAM_IDS.slice(0, getModeDefinition(matchMode).teamCount).map((teamId) => [teamId, 0] as const),
    ),
    captureScores: new Map(
      TEAM_IDS.slice(0, getModeDefinition(matchMode).teamCount).map((teamId) => [teamId, 0] as const),
    ),
    capturePoint: isCaptureMode(matchMode) ? createCapturePointState() : null,
    capturePointConfig: { ...DEFAULT_CAPTURE_POINT_CONFIG, center: { ...map.capturePointCenter } },
    mapId,
    mapWalls,
    mapSpawnPoints: spawnPoints,
    mapEnergySpawnPoints: map.energySpawnPoints,
    mapMechanicsEnabled,
    mapMechanicState: createMapMechanicState(mapId, now, mapMechanicsEnabled),
    mapEventsEnabled: options.mapEventsEnabled ?? false,
    mapEventState: createMapEventState(mapId, now, options.mapEventsEnabled ?? false, options.mapEventSeed ?? 0),
    eliminationState: matchMode === "teamElimination3v3" ? createEliminationState(now) : null,
  };

  while (world.energy.size < MAX_ENERGY && spawnEnergy(world)) {
    // Fill every valid configured point once; stop safely if a map has fewer valid points.
  }
  seedInitialSkillOrbs(world.skillSystem, [...players.values()]);
  return world;
}

export function resetWorldForEliminationRound(world: GameWorld, now: number): void {
  if (!world.eliminationState || world.phase === "finished") return;
  world.now = now;
  world.remainingMs = MATCH_DURATION_MS;
  world.overtimePlayerIds = [];
  world.holderId = null;
  world.holdRemainingMs = null;
  world.projectiles.clear();
  world.energy.clear();
  world.nextEnergySpawnAt = now;
  world.nextEnergyPoint = 0;
  world.skillSystem = createSkillSystem(now, Math.random, getMapDefinition(world.mapId).skillOrbSpawnPoints, getMapDefinition(world.mapId).walls);
  world.mapMechanicState = createMapMechanicState(world.mapId, now, world.mapMechanicsEnabled);
  world.mapEventState = createMapEventState(world.mapId, now, world.mapEventsEnabled, 0);
  world.eliminationState.firstEliminationTeamId = null;
  world.eliminationState.phase = "prep";
  world.eliminationState.deadline = now + world.eliminationState.rules.prepMs;
  for (const [index, player] of [...world.players.values()].entries()) {
    const spawn = world.mapSpawnPoints[index % world.mapSpawnPoints.length] ?? { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.health = player.maxHealth;
    player.alive = true;
    player.respawnAt = null;
    player.shieldUntil = now + SPAWN_SHIELD_MS;
    player.skillShieldHealth = 0;
    player.skillShieldUntil = 0;
    player.skillSlot = { type: null, charges: 0 };
    player.lastCombatAt = now;
    player.regenAccumulatorMs = 0;
    player.mapHealingAccumulatorMs = 0;
    player.killStreak = 0;
    player.recentDamageSources.clear();
    clearAllStatusEffects(player.statusEffects);
    clearExclusiveSkillState(player);
  }
  while (world.energy.size < MAX_ENERGY && spawnEnergy(world)) {
    // Fill every valid configured point once after the round reset.
  }
  seedInitialSkillOrbs(world.skillSystem, [...world.players.values()]);
}

export function applyPlayerInput(world: GameWorld, playerId: string, input: PlayerInput): boolean {
  if (world.phase === "finished") return false;
  if (!Number.isSafeInteger(input.seq) || input.seq < 0) return false;
  const player = world.players.get(playerId);
  if (!player || input.seq <= player.lastProcessedInput) return false;

  player.input = {
    seq: Math.trunc(input.seq),
    moveX: clampFinite(input.moveX),
    moveY: clampFinite(input.moveY),
    aimX: clampFinite(input.aimX),
    aimY: clampFinite(input.aimY),
    firing: input.firing === true,
  };
  player.lastProcessedInput = player.input.seq;
  if (Math.hypot(player.input.moveX, player.input.moveY) > 0.08 || player.input.firing) {
    player.lastMapEventActivityAt = world.now;
  }
  return true;
}

export function stepWorld(world: GameWorld, deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
  if (world.phase === "finished") return;

  const requestedDelta = Math.min(deltaMs, MATCH_DURATION_MS);
  const simulationDelta = world.phase === "playing"
    ? Math.min(requestedDelta, world.remainingMs)
    : requestedDelta;
  if (simulationDelta <= 0) {
    if (world.phase === "playing" && world.remainingMs === 0) finishNormalTime(world);
    return;
  }
  const previousNow = world.now;
  world.now += simulationDelta;

  if (world.phase === "playing") {
    world.remainingMs = Math.max(0, world.remainingMs - simulationDelta);
  }

  advanceHold(world, simulationDelta);
  if (isFinished(world)) return;
  advanceCrystalHealing(world, previousNow, world.now);
  advanceWorldMapEvent(world, previousNow, world.now);

  for (const player of world.players.values()) {
    expireStatusEffects(player.statusEffects, world.now);
    if (player.skillShieldUntil <= world.now) player.skillShieldHealth = 0;
    if (!player.alive) {
      if (!world.eliminationState && player.respawnAt !== null && world.now >= player.respawnAt) respawnPlayer(world, player);
      continue;
    }
    const movement = advanceExclusiveMovement(world, player);
    if (movement.endedState) recordExclusiveSkillEnd(world, player, movement.endedState, "return");
    if (!movement.handled) movePlayer(world, player, simulationDelta);
  }
  advanceHighlightTracker(world.matchHighlightTracker, world.now, alivePlayerIds(world));

  resolvePlayerSeparation(world);
  advanceWorldMapMechanic(world, previousNow, world.now);
  if (isFinished(world)) return;
  refreshBulwarkSuppression(world);
  for (const player of world.players.values()) if (player.alive) updateAimAndFire(world, player);
  advanceProjectiles(world, simulationDelta);
  if (isFinished(world)) return;
  advanceCombatRegeneration(world, simulationDelta);
  collectTouchedEnergy(world);
  if (isFinished(world)) return;
  replenishEnergy(world);
  collectTouchedSkillOrbs(world);
  advanceSkillSystem(
    world.skillSystem,
    world.now,
    [...world.players.values()].filter((player) => player.alive),
  );
  for (const ended of advanceExclusiveSkillEffects([...world.players.values()], world.now)) {
    const player = world.players.get(ended.playerId);
    if (player) recordExclusiveSkillEnd(world, player, ended.state, "expired");
  }
  advanceWorldCapturePoint(world, simulationDelta);
  if (isFinished(world)) return;

  if (world.phase === "playing" && world.remainingMs === 0) finishNormalTime(world);
}

export function damagePlayer(
  world: GameWorld,
  victimId: string,
  attackerId: string,
  amount: number,
): boolean {
  return applyWorldDamage(world, victimId, attackerId, amount, world.now);
}

function applyWorldDamage(
  world: GameWorld,
  victimId: string,
  attackerId: string | null,
  amount: number,
  eventAt: number,
): boolean {
  if (world.phase === "finished") return false;
  const victim = world.players.get(victimId);
  if (!victim?.alive || victim.shieldUntil > eventAt || amount <= 0 || !Number.isFinite(amount)) return false;

  const attacker = attackerId === null ? undefined : world.players.get(attackerId);
  if (attacker && attacker.id !== victim.id && attacker.teamId !== null && attacker.teamId === victim.teamId) {
    return false;
  }
  markCombat(victim, eventAt);
  if (attacker && attacker.id !== victim.id) markCombat(attacker, eventAt);

  if (victim.skillShieldUntil <= eventAt) victim.skillShieldHealth = 0;
  const reducedAmount = Math.max(MIN_DAMAGE, amount * effectiveDamageTakenMultiplier(world, victim, attacker, eventAt));
  const absorbed = Math.min(victim.skillShieldHealth, reducedAmount);
  victim.skillShieldHealth -= absorbed;
  const healthDamage = reducedAmount - absorbed;
  if (healthDamage === 0) return true;
  const roundedDamage = Math.max(0, Math.round(healthDamage));
  victim.damageTaken = (victim.damageTaken ?? 0) + roundedDamage;
  if (attacker && attacker.id !== victim.id) {
    attacker.damageDealt = (attacker.damageDealt ?? 0) + roundedDamage;
    if (hasActiveStatusEffect(attacker.statusEffects, "neon-overdrive", eventAt)) {
      attacker.mapMechanicContribution!.neonDamage += roundedDamage;
    }
    victim.recentDamageSources.set(attacker.id, eventAt);
    victim.lastDamageSourceId = attacker.id;
    victim.lastDamagedAt = eventAt;
  } else {
    victim.lastDamageSourceId = null;
    victim.lastDamagedAt = eventAt;
  }
  victim.health = Math.max(0, victim.health - healthDamage);
  if (victim.health > 0) return true;

  victim.alive = false;
  victim.vx = 0;
  victim.vy = 0;
  victim.respawnAt = world.eliminationState ? null : eventAt + RESPAWN_DELAY_MS;
  victim.input = { ...EMPTY_INPUT, seq: victim.lastProcessedInput };
  victim.skillShieldHealth = 0;
  victim.skillShieldUntil = 0;
  victim.killStreak = 0;
  victim.mapHealingAccumulatorMs = 0;
  victim.deaths = (victim.deaths ?? 0) + 1;
  clearSkillSlot(victim);
  const endedExclusiveSkill = clearExclusiveSkillState(victim);
  if (endedExclusiveSkill) recordExclusiveSkillEnd(world, victim, endedExclusiveSkill, "death");
  clearAllStatusEffects(victim.statusEffects);

  if (attacker && attacker.id !== victim.id) {
    if (
      hasActiveStatusEffect(attacker.statusEffects, "neon-overdrive", eventAt)
      || hasActiveStatusEffect(attacker.statusEffects, "crystal-resonance", eventAt)
    ) {
      attacker.mapMechanicContribution!.mechanicEliminations += 1;
    }
    attacker.killStreak += 1;
    recordFiveKillStreak(world.matchHighlightTracker, attacker.id, eventAt, attacker.killStreak);
    world.killFeed.push({
      id: `kill-${world.nextKillFeedId++}`,
      at: eventAt,
      killerId: attacker.id,
      victimId: victim.id,
      streak: attacker.killStreak,
    });
    if (world.killFeed.length > 6) world.killFeed.splice(0, world.killFeed.length - 6);
    addPlayerScore(world, attacker, KILL_SCORE + (world.holderId === victim.id ? HOLDER_KILL_BONUS : 0));
    attacker.kills += 1;
    for (const [assistId, at] of victim.recentDamageSources) {
      if (assistId === attacker.id || eventAt - at > 6_000) continue;
      const assister = world.players.get(assistId);
      if (assister) assister.assists = (assister.assists ?? 0) + 1;
    }
    handleScoreChange(world, attacker.id);
  }
  victim.recentDamageSources.clear();
  if (!attacker || attacker.id === victim.id) victim.lastDamageSourceId = null;
  return true;
}

export function collectEnergy(world: GameWorld, playerId: string, energyId: string): boolean {
  if (world.phase === "finished") return false;
  const player = world.players.get(playerId);
  if (!player?.alive || !world.energy.delete(energyId)) return false;

  addPlayerScore(world, player, ENERGY_SCORE);
  player.energyCollected += 1;
  if (player.characterId === "medic") {
    const healed = Math.min(player.maxHealth - player.health, MEDIC_ENERGY_HEAL * player.selfHealingMultiplier);
    player.health += healed;
    player.healingDone = (player.healingDone ?? 0) + healed;
  }
  world.nextEnergySpawnAt = Math.max(world.nextEnergySpawnAt, world.now + ENERGY_RESPAWN_MS);
  handleScoreChange(world, player.id);
  return true;
}

export function collectWorldSkillOrb(world: GameWorld, playerId: string, orbId: string): boolean {
  if (world.phase === "finished") return false;
  const player = world.players.get(playerId);
  return Boolean(player?.alive && collectSkillOrb(world.skillSystem, player, orbId));
}

export function applyWorldSkillAction(world: GameWorld, playerId: string, skillActionSeq: number): boolean {
  if (world.phase === "finished") return false;
  const player = world.players.get(playerId);
  if (!player) return false;
  const action = acceptSkillAction(player, skillActionSeq);
  if (!action.accepted || !action.skill) return action.accepted;
  const consumed = executeSkill(world, player, action.skill);
  if (consumed) {
    player.skillContribution = (player.skillContribution ?? 0) + 1;
    clearSkillSlot(player);
  }
  return true;
}

export function applyWorldExclusiveSkill(world: GameWorld, playerId: string, direction: Vec2): boolean {
  if (world.phase === "finished") return false;
  const player = world.players.get(playerId);
  if (!player) return false;
  const result = applyExclusiveSkill(player, world.now, direction, {
    walls: world.mapWalls.query({ x: 0, y: 0, width: ARENA_WIDTH, height: ARENA_HEIGHT }),
    bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    playerRadius: PLAYER_RADIUS,
  });
  if (!result.ok) return false;
  let eventTarget = result.target;
  if (result.definition.id === "mobile-bulwark") {
    const facing = Math.hypot(direction.x, direction.y) > 0.08
      ? normalize(direction)
      : { x: Math.cos(player.angle), y: Math.sin(player.angle) };
    player.angle = Math.atan2(facing.y, facing.x);
    eventTarget = {
      x: result.origin.x + facing.x * BULWARK_PRESENTATION_LENGTH,
      y: result.origin.y + facing.y * BULWARK_PRESENTATION_LENGTH,
    };
  }
  recordExclusiveSkillEvent(world, {
    playerId: player.id,
    skillId: result.definition.id,
    stage: "cast",
    origin: result.origin,
    target: eventTarget,
  });
  player.skillContribution = (player.skillContribution ?? 0) + 1;
  let metadata: ExclusiveSkillEvent["metadata"];
  if (result.definition.id === "phase-shift") {
    addStatusEffect(player.statusEffects, "phase-fire-lock", world.now, result.definition.balance.fireLockDurationMs ?? 250);
    addStatusEffect(player.statusEffects, "phase-reveal", world.now, result.definition.balance.revealDurationMs ?? 1_200);
  }
  if (result.definition.id === "pulse-heal") {
    const healedTargetIds: string[] = [];
    const cleansedTargetIds: string[] = [];
    const selfHealthRatio = player.maxHealth > 0 ? player.health / player.maxHealth : 1;
    const selfHealed = Math.min(
      player.maxHealth - player.health,
      (result.definition.balance.selfHeal ?? 28) * player.selfHealingMultiplier * player.exclusivePotencyMultiplier,
    );
    player.health += selfHealed;
    player.healingDone = (player.healingDone ?? 0) + selfHealed;
    if (selfHealed > 0) {
      healedTargetIds.push(player.id);
      recordHealingCandidate(world.matchHighlightTracker, {
        healerId: player.id,
        targetId: player.id,
        beforeHealthRatio: selfHealthRatio,
        amount: selfHealed,
        at: world.now,
      });
    }
    if (clearPurifiableStatus(player.statusEffects).length > 0) cleansedTargetIds.push(player.id);
    for (const ally of world.players.values()) {
      if (world.matchMode !== "solo" && ally.id !== player.id && ally.alive && ally.teamId !== null && ally.teamId === player.teamId && distanceSquared(ally, player) <= (result.definition.balance.radius ?? 280) ** 2) {
        const beforeHealthRatio = ally.maxHealth > 0 ? ally.health / ally.maxHealth : 1;
        const healed = Math.min(
          ally.maxHealth - ally.health,
          (result.definition.balance.allyHeal ?? 34)
            * player.activeHealingMultiplier
            * ally.receivedHealingMultiplier
            * player.exclusivePotencyMultiplier,
        );
        ally.health += healed;
        player.healingDone = (player.healingDone ?? 0) + healed;
        if (healed > 0) {
          healedTargetIds.push(ally.id);
          recordHealingCandidate(world.matchHighlightTracker, {
            healerId: player.id,
            targetId: ally.id,
            beforeHealthRatio,
            amount: healed,
            at: world.now,
          });
        }
        if (clearPurifiableStatus(ally.statusEffects).length > 0) cleansedTargetIds.push(ally.id);
      }
    }
    metadata = {
      ...(healedTargetIds.length > 0 ? { healedTargetIds } : {}),
      ...(cleansedTargetIds.length > 0 ? { cleansedTargetIds } : {}),
    };
  }
  if (result.definition.id === "mobile-bulwark" && world.matchMode !== "solo" && player.teamId !== null) {
    const facing = { x: Math.cos(player.angle), y: Math.sin(player.angle) };
    const suppressionRadius = result.definition.balance.suppressionRadius ?? BULWARK_SUPPRESSION_RADIUS;
    const affectedTargetIds: string[] = [];
    for (const target of world.players.values()) {
      if (target.id === player.id || !target.alive || target.teamId === null) continue;
      const targetDistanceSquared = distanceSquared(target, player);
      if (target.teamId !== player.teamId) {
        if (targetDistanceSquared <= suppressionRadius ** 2) affectedTargetIds.push(target.id);
        continue;
      }
      const relative = { x: target.x - player.x, y: target.y - player.y };
      if (targetDistanceSquared <= BULWARK_ALLY_PROTECTION_RADIUS ** 2 && facing.x * relative.x + facing.y * relative.y <= 0) {
        affectedTargetIds.push(target.id);
      }
    }
    if (affectedTargetIds.length > 0) metadata = { affectedTargetIds };
  }
  recordExclusiveSkillEvent(world, {
    playerId: player.id,
    skillId: result.definition.id,
    stage: "active",
    origin: result.origin,
    target: eventTarget,
    metadata,
  });
  return true;
}

export function refreshWorldScoreState(world: GameWorld, playerId: string): void {
  handleScoreChange(world, playerId);
}

export function worldToSnapshot(world: GameWorld): GameSnapshot {
  return {
    serverTime: world.now,
    phase: world.phase,
    remainingMs: world.remainingMs,
    overtimePlayerIds: [...world.overtimePlayerIds],
    winnerIds: [...world.winnerIds],
    holderId: world.holderId,
    holdRemainingMs: world.holdRemainingMs,
    finishedAt: world.finishedAt,
    matchMvpId: world.matchMvpId,
    matchMvpScore: world.matchMvpScore,
    ...(world.phase === "finished" ? { matchHighlights: [...world.matchHighlights] } : {}),
    players: [...world.players.values()].map(({ input: _input, nextFireAt: _nextFireAt, lastCombatAt: _lastCombatAt, regenAccumulatorMs: _regenAccumulatorMs, mapHealingAccumulatorMs: _mapHealingAccumulatorMs, killStreak: _killStreak, recentDamageSources: _recentDamageSources, statusEffects, projectileMaxDistance: _projectileMaxDistance, projectileRadius: _projectileRadius, shieldStrengthMultiplier: _shieldStrengthMultiplier, shieldMoveMultiplier: _shieldMoveMultiplier, selfHealingMultiplier: _selfHealingMultiplier, activeHealingMultiplier: _activeHealingMultiplier, receivedHealingMultiplier: _receivedHealingMultiplier, regenDelayAddMs: _regenDelayAddMs, exclusivePotencyMultiplier: _exclusivePotencyMultiplier, lastMapEventActivityAt: _lastMapEventActivityAt, mapEventMoveMultiplier: _mapEventMoveMultiplier, ...player }) => ({ ...player, combatStates: [...statusEffects.values()].map(({ id, startedAt, expiresAt }) => ({ id, startedAt, expiresAt })) })),
    projectiles: [...world.projectiles.values()].map(({ distanceTraveled: _distanceTraveled, damage: _damage, maxDistance: _maxDistance, radius: _radius, ...projectile }) => projectile),
    energy: [...world.energy.values()],
    skillOrbs: [...world.skillSystem.orbs.values()],
    killFeed: [...world.killFeed],
    exclusiveSkillEvents: world.exclusiveSkillEvents.map((event) => ({
      ...event,
      origin: { ...event.origin },
      target: { ...event.target },
      metadata: event.metadata ? {
        healedTargetIds: event.metadata.healedTargetIds ? [...event.metadata.healedTargetIds] : undefined,
        cleansedTargetIds: event.metadata.cleansedTargetIds ? [...event.metadata.cleansedTargetIds] : undefined,
        affectedTargetIds: event.metadata.affectedTargetIds ? [...event.metadata.affectedTargetIds] : undefined,
      } : undefined,
    })),
    projectileImpactEvents: [...world.projectileImpactEvents],
    matchMode: world.matchMode,
    teamScores: [...world.teamScores].map(([teamId, score]) => ({
      teamId,
      score,
      targetScore: getModeDefinition(world.matchMode).targetScore,
    })),
    captureScores: [...world.captureScores].map(([teamId, score]) => ({
      teamId,
      score,
      targetScore: DEFAULT_CAPTURE_POINT_CONFIG.targetProgress,
    })),
    capturePoint: world.capturePoint ? {
      x: world.capturePointConfig.center.x,
      y: world.capturePointConfig.center.y,
      radius: world.capturePointConfig.radius,
      ownerTeamId: world.capturePoint.ownerTeamId,
      progress: world.capturePoint.progress,
      targetProgress: world.capturePointConfig.targetProgress,
      contestingTeams: [...world.capturePoint.contestingTeams],
      state: world.capturePoint.state,
    } : null,
    mapId: world.mapId,
    mapMechanic: world.mapMechanicState ? mapMechanicSnapshot(world.mapMechanicState) : null,
    mapEvent: world.mapEventState ? mapEventSnapshot(world.mapEventState) : null,
  };
}

function advanceWorldMapMechanic(world: GameWorld, startedAt: number, endedAt: number): void {
  const state = world.mapMechanicState;
  if (!state) return;

  let cursor = startedAt;
  let segments = 0;
  while (cursor < endedAt && segments < 1_024) {
    segments += 1;
    const segmentEnd = Math.min(endedAt, state.phaseEndsAt);
    if (state.phase === "active") {
      if (state.definition.kind === "reactor-vent") applyReactorDamageThrough(world, state, segmentEnd);
      if (state.definition.kind === "neon-overdrive") applyNeonOverdrive(world, state, segmentEnd);
      if (state.definition.kind === "crystal-resonance") applyCrystalResonance(world, state, cursor, segmentEnd);
    } else if (state.phase === "warning" && state.definition.kind === "reactor-vent") {
      trackReactorEscapes(world, state, segmentEnd);
    }
    advanceMapMechanicState(state, segmentEnd, world.phase === "playing");
    if (segmentEnd === cursor && state.phaseEndsAt <= cursor) break;
    cursor = segmentEnd;
  }
}

function advanceWorldMapEvent(world: GameWorld, startedAt: number, endedAt: number): void {
  for (const player of world.players.values()) player.mapEventMoveMultiplier = 1;
  const state = world.mapEventState;
  if (!state) return;
  const mechanicBusy = world.mapMechanicState?.phase === "warning" || world.mapMechanicState?.phase === "active";
  advanceMapEventState(state, endedAt, {
    mapMechanicBusy: mechanicBusy,
    allowNewEvent: world.phase === "playing",
  });
  if (state.phase !== "active") return;

  if (state.kind === "supply-drop") {
    updateSupplyDrop(world, state, startedAt, endedAt);
  } else if (state.kind === "area-lockdown") {
    updateAreaLockdown(world, state, endedAt);
  } else if (state.kind === "global-scan") {
    state.revealedPlayerIds.clear();
    for (const player of world.players.values()) {
      if (player.alive && endedAt - player.lastMapEventActivityAt <= 700) state.revealedPlayerIds.add(player.id);
    }
  } else {
    updateEnergyStorm(world, state, endedAt);
  }
}

function updateSupplyDrop(world: GameWorld, state: MapEventState, startedAt: number, endedAt: number): void {
  const point = state.point;
  if (!point) return;
  const candidates = [...world.players.values()]
    .filter((player) => player.alive && distanceSquared(player, point) <= 60 ** 2)
    .sort((left, right) => left.id.localeCompare(right.id));
  const insideIds = new Set(candidates.map((player) => player.id));
  for (const playerId of [...state.participantStartedAt.keys()]) {
    const player = world.players.get(playerId);
    const capturedAt = state.participantStartedAt.get(playerId)!;
    if (!insideIds.has(playerId) || !player?.alive || player.lastCombatAt > capturedAt) state.participantStartedAt.delete(playerId);
  }
  for (const player of candidates) {
    if (!state.participantStartedAt.has(player.id)) state.participantStartedAt.set(player.id, startedAt);
  }
  const claimant = candidates.find((player) => endedAt - (state.participantStartedAt.get(player.id) ?? endedAt) >= 1_000);
  if (!claimant) return;
  claimant.health = Math.min(claimant.maxHealth, claimant.health + 25);
  if (claimant.skillSlot.charges === 0) {
    const skills = ["dash", "shield", "spread", "heal"] as const;
    claimant.skillSlot = { type: skills[state.round % skills.length]!, charges: 1 };
  }
  state.claimedPlayerIds.add(claimant.id);
  state.phaseEndsAt = endedAt;
  advanceMapEventState(state, endedAt, { mapMechanicBusy: false, allowNewEvent: world.phase === "playing" });
}

function updateAreaLockdown(world: GameWorld, state: MapEventState, endedAt: number): void {
  const zone = state.zone;
  if (!zone) return;
  for (const player of world.players.values()) {
    if (!player.alive || !zoneContainsPoint(zone, player)) continue;
    const graceUntil = state.graceUntilByPlayer.get(player.id) ?? state.phaseStartedAt + 2_000;
    state.graceUntilByPlayer.set(player.id, graceUntil);
    if (endedAt < graceUntil) continue;
    player.mapEventMoveMultiplier = Math.min(player.mapEventMoveMultiplier, 0.9);
    applyMapEventDamageTicks(world, state, player, graceUntil, endedAt, 5);
  }
}

function updateEnergyStorm(world: GameWorld, state: MapEventState, endedAt: number): void {
  const safeZone = state.zone;
  if (!safeZone) return;
  for (const player of world.players.values()) {
    if (!player.alive || zoneContainsPoint(safeZone, player)) continue;
    player.mapEventMoveMultiplier = Math.min(player.mapEventMoveMultiplier, 0.9);
    applyMapEventDamageTicks(world, state, player, state.phaseStartedAt, endedAt, 4);
  }
}

function applyMapEventDamageTicks(
  world: GameWorld,
  state: MapEventState,
  player: WorldPlayer,
  firstTickBase: number,
  endedAt: number,
  damage: number,
): void {
  let tickAt = state.damageAtByPlayer.get(player.id) ?? firstTickBase;
  while (tickAt + 1_000 <= endedAt) {
    tickAt += 1_000;
    const previous = player.health;
    player.health = Math.max(1, player.health - damage);
    if (player.health < previous) {
      player.lastCombatAt = tickAt;
      player.regenAccumulatorMs = 0;
      player.damageTaken = (player.damageTaken ?? 0) + previous - player.health;
    }
  }
  state.damageAtByPlayer.set(player.id, tickAt);
}

function trackReactorEscapes(world: GameWorld, state: MapMechanicState, now: number): void {
  if (state.definition.kind !== "reactor-vent") return;
  const zone = state.definition.zones[state.zoneIndex]!;
  for (const player of world.players.values()) {
    const escaped = updateReactorEscapeParticipant(
      state,
      player.id,
      player.alive && zoneContainsPoint(zone, player),
      now,
    );
    if (escaped) {
      player.mapMechanicContribution!.reactorEscapes += 1;
      recordHazardEscape(world.matchHighlightTracker, player.id, now, state.definition.kind);
    }
  }
}

function applyNeonOverdrive(world: GameWorld, state: MapMechanicState, segmentEnd: number): void {
  if (state.definition.kind !== "neon-overdrive") return;
  const zone = state.definition.zones[state.zoneIndex]!;
  for (const player of world.players.values()) {
    if (!player.alive || !zoneContainsPoint(zone, player)) continue;
    addStatusEffect(player.statusEffects, "neon-overdrive", segmentEnd, state.definition.effect.graceMs);
  }
}

function applyCrystalResonance(world: GameWorld, state: MapMechanicState, segmentStart: number, segmentEnd: number): void {
  if (state.definition.kind !== "crystal-resonance") return;
  const zone = state.definition.zones[state.zoneIndex]!;
  for (const player of world.players.values()) {
    const inside = player.alive && zoneContainsPoint(zone, player);
    if (inside && !state.participantChargeStartedAt.has(player.id) && !state.claimedPlayerIds.has(player.id)) {
      updateCrystalParticipant(state, player.id, true, segmentStart);
    }
    const claimed = updateCrystalParticipant(state, player.id, inside, segmentEnd);
    if (claimed) {
      addStatusEffect(player.statusEffects, "crystal-resonance", segmentEnd, state.definition.effect.durationMs);
      player.mapHealingAccumulatorMs = 0;
      player.mapMechanicContribution!.crystalResonances += 1;
    }
  }
}

function applyReactorDamageThrough(world: GameWorld, state: MapMechanicState, segmentEnd: number): void {
  if (state.definition.kind !== "reactor-vent") return;
  const zone = state.definition.zones[state.zoneIndex]!;
  const { damagePerSecond, damageTickMs } = state.definition.effect;
  for (const player of world.players.values()) {
    let lastTickAt = state.reactorDamageAt.get(player.id) ?? state.phaseStartedAt;
    while (lastTickAt + damageTickMs <= segmentEnd) {
      lastTickAt += damageTickMs;
      if (zoneContainsPoint(zone, player)) {
        applyWorldDamage(world, player.id, null, damagePerSecond, lastTickAt);
      }
    }
    state.reactorDamageAt.set(player.id, lastTickAt);
  }
}

function advanceWorldCapturePoint(world: GameWorld, deltaMs: number): void {
  if (!world.capturePoint || world.phase === "finished") return;
  world.capturePoint = advanceCapturePoint(world.capturePoint, [...world.players.values()], deltaMs, world.capturePointConfig);
  if (world.capturePoint.state !== "owned" || !world.capturePoint.ownerTeamId || !world.capturePoint.contestingTeams.includes(world.capturePoint.ownerTeamId)) return;
  const teamId = world.capturePoint.ownerTeamId;
  const score = Math.min(
    world.capturePointConfig.targetProgress,
    (world.captureScores.get(teamId) ?? 0) + deltaMs / 1_000,
  );
  world.captureScores.set(teamId, score);
  const contributorIds = [...world.players.values()]
    .filter((player) => player.alive
      && player.teamId === teamId
      && distanceSquared(player, world.capturePointConfig.center) <= world.capturePointConfig.radius ** 2)
    .map((player) => player.id);
  recordCaptureScore(world.matchHighlightTracker, {
    at: world.now,
    targetScore: world.capturePointConfig.targetProgress,
    scores: Object.fromEntries(world.captureScores),
    scoringTeamId: teamId,
    scoreDelta: deltaMs / 1_000,
    contributorIds,
  });
  if (isCapturePointComplete(score, world.capturePointConfig)) finishWorldMatch(world, playerIdsForTeam(world, teamId));
}

function executeSkill(world: GameWorld, player: WorldPlayer, skill: SkillType): boolean {
  if (!player.alive) return false;
  switch (skill) {
    case "dash":
      return executeDash(world, player);
    case "shield":
      player.skillShieldHealth = SHIELD_STRENGTH * player.shieldStrengthMultiplier;
      player.skillShieldUntil = world.now + SHIELD_DURATION_MS;
      return true;
    case "spread": {
      const aim = skillAim(player);
      for (const offset of [-SPREAD_ANGLE_RADIANS, 0, SPREAD_ANGLE_RADIANS]) {
        spawnProjectile(world, player, Math.atan2(aim.y, aim.x) + offset, SPREAD_PROJECTILE_DAMAGE);
      }
      return true;
    }
    case "heal":
      if (player.health >= player.maxHealth) return false;
      player.health = Math.min(player.maxHealth, player.health + HEAL_AMOUNT * player.selfHealingMultiplier);
      return true;
  }
}

function executeDash(world: GameWorld, player: WorldPlayer): boolean {
  const movementLength = Math.hypot(player.input.moveX, player.input.moveY);
  const aimLength = Math.hypot(player.input.aimX, player.input.aimY);
  if (movementLength <= 0.08 && aimLength <= 0.08) return false;
  const direction = movementLength > 0.08
    ? normalize({ x: player.input.moveX, y: player.input.moveY })
    : normalize({ x: player.input.aimX, y: player.input.aimY });
  const delta = { x: direction.x * DASH_DISTANCE, y: direction.y * DASH_DISTANCE };
  const next = moveCircleUntilBlocked(
    player,
    delta,
    PLAYER_RADIUS,
    world.mapWalls.query(movementBounds(player, delta)),
    { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    [...world.players.values()]
      .filter((candidate) => candidate.id !== player.id && candidate.alive)
      .map((candidate) => ({ position: candidate, radius: PLAYER_RADIUS })),
  );
  player.x = next.x;
  player.y = next.y;
  return true;
}

function skillAim(player: WorldPlayer): Vec2 {
  const length = Math.hypot(player.input.aimX, player.input.aimY);
  return length > 0.08
    ? normalize({ x: player.input.aimX, y: player.input.aimY })
    : { x: Math.cos(player.angle), y: Math.sin(player.angle) };
}

function clampFinite(value: number): number {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function isInFront(defender: WorldPlayer, attacker: WorldPlayer): boolean {
  const deltaX = attacker.x - defender.x;
  const deltaY = attacker.y - defender.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length === 0) return true;
  return (Math.cos(defender.angle) * deltaX + Math.sin(defender.angle) * deltaY) / length >= Math.cos(70 * Math.PI / 180);
}

function findProtectingBulwark(world: GameWorld, ally: WorldPlayer, attacker: WorldPlayer): WorldPlayer | null {
  if (world.matchMode === "solo" || ally.teamId === null || attacker.teamId === ally.teamId) return null;
  for (const fortress of world.players.values()) {
    if (fortress.id === ally.id || !fortress.alive || fortress.teamId !== ally.teamId || !isExclusiveEffectActive(fortress, "mobile-bulwark", world.now)) continue;
    if (distanceSquared(fortress, ally) > BULWARK_ALLY_PROTECTION_RADIUS ** 2 || !isInFront(fortress, attacker)) continue;
    const allyDirection = { x: ally.x - fortress.x, y: ally.y - fortress.y };
    if (Math.cos(fortress.angle) * allyDirection.x + Math.sin(fortress.angle) * allyDirection.y <= 0) return fortress;
  }
  return null;
}

function refreshBulwarkSuppression(world: GameWorld): void {
  const activeFortresses = [...world.players.values()].filter((player) => player.alive && player.teamId !== null && isExclusiveEffectActive(player, "mobile-bulwark", world.now));
  for (const player of world.players.values()) {
    player.statusEffects.delete("bulwark-suppression");
    if (!player.alive || player.teamId === null) continue;
    if (activeFortresses.some((fortress) => fortress.teamId !== player.teamId && distanceSquared(fortress, player) <= BULWARK_SUPPRESSION_RADIUS ** 2)) {
      addStatusEffect(player.statusEffects, "bulwark-suppression", world.now, 100);
    }
  }
}

interface ExclusiveMovementResult {
  handled: boolean;
  endedState: ExclusiveRuntimeState | null;
}

function advanceExclusiveMovement(world: GameWorld, player: WorldPlayer): ExclusiveMovementResult {
  const state = player.exclusiveSkillState;
  if (state?.skillId !== "breach" || !state.movementFrom || !state.movementTarget || state.movementStartedAt === undefined || state.movementEndsAt === undefined) {
    return { handled: false, endedState: null };
  }
  const duration = Math.max(1, state.movementEndsAt - state.movementStartedAt);
  const progress = clamp((world.now - state.movementStartedAt) / duration, 0, 1);
  const desired = { x: state.movementFrom.x + (state.movementTarget.x - state.movementFrom.x) * progress, y: state.movementFrom.y + (state.movementTarget.y - state.movementFrom.y) * progress };
  const delta = { x: desired.x - player.x, y: desired.y - player.y };
  const next = moveCircleUntilBlocked(player, delta, PLAYER_RADIUS, world.mapWalls.query(movementBounds(player, delta)), { width: ARENA_WIDTH, height: ARENA_HEIGHT });
  player.vx = delta.x * 1_000 / duration;
  player.vy = delta.y * 1_000 / duration;
  player.x = next.x;
  player.y = next.y;
  const blocked = Math.hypot(next.x - desired.x, next.y - desired.y) > 0.5;
  if (progress >= 1 || blocked) {
    player.vx = 0; player.vy = 0;
    if (state.returning) player.exclusiveSkillState = null;
    else { delete state.movementFrom; delete state.movementTarget; delete state.movementStartedAt; delete state.movementEndsAt; }
    return { handled: true, endedState: state.returning ? state : null };
  }
  return { handled: true, endedState: null };
}

function effectiveMoveMultiplier(world: GameWorld, player: WorldPlayer): number {
  let multiplier = isExclusiveEffectActive(player, "capacitor-overload", world.now)
    ? 1.15
    : isExclusiveEffectActive(player, "afterimage-run", world.now)
      ? 1.28
      : 1;
  if (hasActiveStatusEffect(player.statusEffects, "neon-overdrive", world.now)) {
    multiplier *= MAP_MECHANICS["neon-docks"].effect.moveMultiplier;
  }
  if (player.skillShieldUntil > world.now && player.skillShieldHealth > 0) multiplier *= player.shieldMoveMultiplier;
  multiplier *= player.mapEventMoveMultiplier;
  return multiplier;
}

function effectiveFireCooldownMultiplier(world: GameWorld, player: WorldPlayer): number {
  let multiplier = isExclusiveEffectActive(player, "capacitor-overload", world.now) ? 0.7 : 1;
  if (hasActiveStatusEffect(player.statusEffects, "bulwark-suppression", world.now)) multiplier *= 1.25;
  if (hasActiveStatusEffect(player.statusEffects, "neon-overdrive", world.now)) {
    multiplier *= MAP_MECHANICS["neon-docks"].effect.fireCooldownMultiplier;
  }
  return multiplier;
}

function effectiveProjectileSpeedMultiplier(world: GameWorld, player: WorldPlayer): number {
  return hasActiveStatusEffect(player.statusEffects, "neon-overdrive", world.now)
    ? MAP_MECHANICS["neon-docks"].effect.projectileSpeedMultiplier
    : 1;
}

function effectiveDamageTakenMultiplier(
  world: GameWorld,
  player: WorldPlayer,
  attacker: WorldPlayer | undefined,
  eventAt = world.now,
): number {
  let multiplier = 1;
  if (attacker) {
    if (isExclusiveEffectActive(player, "mobile-bulwark", eventAt) && isInFront(player, attacker)) multiplier *= 0.55;
    else if (findProtectingBulwark(world, player, attacker) !== null) multiplier *= 0.75;
  }
  if (hasActiveStatusEffect(player.statusEffects, "crystal-resonance", eventAt)) {
    multiplier *= MAP_MECHANICS["crystal-ruins"].effect.damageTakenMultiplier;
  }
  return multiplier;
}

function movePlayer(world: GameWorld, player: WorldPlayer, deltaMs: number): void {
  const direction = normalize({ x: player.input.moveX, y: player.input.moveY });
  const speedMultiplier = effectiveMoveMultiplier(world, player);
  player.vx = direction.x * player.moveSpeed * speedMultiplier;
  player.vy = direction.y * player.moveSpeed * speedMultiplier;
  const seconds = deltaMs / 1_000;
  const delta = { x: player.vx * seconds, y: player.vy * seconds };
  const nearbyWalls = world.mapWalls.query(movementBounds(player, delta));
  const next = moveCircleSafely(
    player,
    delta,
    PLAYER_RADIUS,
    nearbyWalls,
    { width: ARENA_WIDTH, height: ARENA_HEIGHT },
  );
  player.x = next.x;
  player.y = next.y;
}

function updateAimAndFire(world: GameWorld, player: WorldPlayer): void {
  const aimLength = Math.hypot(player.input.aimX, player.input.aimY);
  if (aimLength > 0.08) {
    const aim = normalize({ x: player.input.aimX, y: player.input.aimY });
    player.angle = Math.atan2(aim.y, aim.x);
    if (player.input.firing && world.now >= player.nextFireAt) {
      if (hasActiveStatusEffect(player.statusEffects, "phase-fire-lock", world.now)) return;
      const runnerDamage = isExclusiveEffectActive(player, "afterimage-run", world.now) ? player.damage * 1.15 : player.damage;
      spawnProjectile(world, player, player.angle, runnerDamage);
      player.nextFireAt = world.now + player.fireCooldownMs * effectiveFireCooldownMultiplier(world, player);
    }
  }
}

function spawnProjectile(world: GameWorld, player: WorldPlayer, angle: number, damage: number): void {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const projectileSpeed = player.projectileSpeed * effectiveProjectileSpeedMultiplier(world, player);
  const id = `projectile-${world.nextProjectileId++}`;
  world.projectiles.set(id, {
    id,
    ownerId: player.id,
    x: player.x + direction.x * (PLAYER_RADIUS + player.projectileRadius + 4),
    y: player.y + direction.y * (PLAYER_RADIUS + player.projectileRadius + 4),
    vx: direction.x * projectileSpeed,
    vy: direction.y * projectileSpeed,
    damage,
    distanceTraveled: 0,
    maxDistance: player.projectileMaxDistance,
    radius: player.projectileRadius,
  });
}

function advanceProjectiles(world: GameWorld, deltaMs: number): void {
  for (const projectile of [...world.projectiles.values()]) {
    if (world.phase === "finished") break;
    const speed = Math.hypot(projectile.vx, projectile.vy);
    const requestedDistance = speed * deltaMs / 1_000;
    const maxDistance = projectile.maxDistance ?? PROJECTILE_MAX_DISTANCE;
    const radius = projectile.radius ?? PROJECTILE_RADIUS;
    const remainingDistance = maxDistance - projectile.distanceTraveled;
    const activeDistance = Math.min(requestedDistance, remainingDistance);
    if (activeDistance <= 0 || speed <= 0) {
      world.projectiles.delete(projectile.id);
      continue;
    }
    const activeMs = activeDistance / speed * 1_000;
    const delta = { x: projectile.vx * activeMs / 1_000, y: projectile.vy * activeMs / 1_000 };
    const wallHit = firstWallHit(
      projectile,
      delta,
      radius,
      world.mapWalls.query(movementBounds(projectile, delta, radius)),
    );
    let targetHit: { player: WorldPlayer; time: number } | null = null;
    for (const player of world.players.values()) {
      if (player.id === projectile.ownerId || !player.alive) continue;
      const owner = world.players.get(projectile.ownerId);
      if (owner && owner.teamId !== null && owner.teamId === player.teamId) continue;
      const hit = sweepCircleCircle(projectile, delta, radius, player, PLAYER_RADIUS);
      if (hit && (!targetHit || hit.time < targetHit.time)) targetHit = { player, time: hit.time };
    }

    if (wallHit && (!targetHit || wallHit.time <= targetHit.time)) {
      recordProjectileImpact(
        world,
        projectile,
        "wall",
        { x: projectile.x + delta.x * wallHit.time, y: projectile.y + delta.y * wallHit.time },
        null,
      );
      world.projectiles.delete(projectile.id);
      continue;
    }
    if (targetHit) {
      const attacker = world.players.get(projectile.ownerId);
      const impactKind: ProjectileImpactEvent["kind"] = targetHit.player.shieldUntil > world.now
        || (targetHit.player.skillShieldUntil > world.now && targetHit.player.skillShieldHealth > 0)
        ? "shield"
        : "player";
      recordProjectileImpact(
        world,
        projectile,
        impactKind,
        { x: projectile.x + delta.x * targetHit.time, y: projectile.y + delta.y * targetHit.time },
        targetHit.player.id,
      );
      damagePlayer(world, targetHit.player.id, projectile.ownerId, projectile.damage ?? attacker?.damage ?? 0);
      world.projectiles.delete(projectile.id);
      continue;
    }

    projectile.x += delta.x;
    projectile.y += delta.y;
    projectile.distanceTraveled += Math.hypot(delta.x, delta.y);
    if (activeDistance < requestedDistance || projectile.distanceTraveled >= maxDistance || projectile.x < radius || projectile.x > ARENA_WIDTH - radius || projectile.y < radius || projectile.y > ARENA_HEIGHT - radius) {
      world.projectiles.delete(projectile.id);
    }
  }
}

function collectTouchedEnergy(world: GameWorld): void {
  for (const player of world.players.values()) {
    if (!player.alive) continue;
    for (const energy of world.energy.values()) {
      if (circleHitsCircle(player, PLAYER_RADIUS, energy, ENERGY_RADIUS)) {
        collectEnergy(world, player.id, energy.id);
        if (world.phase === "finished") return;
      }
    }
  }
}

function collectTouchedSkillOrbs(world: GameWorld): void {
  for (const player of world.players.values()) {
    if (!player.alive) continue;
    for (const orb of world.skillSystem.orbs.values()) {
      if (circleHitsCircle(player, PLAYER_RADIUS, orb, SKILL_ORB_RADIUS)) {
        collectWorldSkillOrb(world, player.id, orb.id);
      }
    }
  }
}

function replenishEnergy(world: GameWorld): void {
  if (world.energy.size >= MAX_ENERGY || world.now < world.nextEnergySpawnAt || world.phase === "finished") return;
  spawnEnergy(world);
  world.nextEnergySpawnAt = world.now + ENERGY_RESPAWN_MS;
}

function spawnEnergy(world: GameWorld): boolean {
  for (let attempt = 0; attempt < world.mapEnergySpawnPoints.length; attempt += 1) {
    const pointIndex = world.nextEnergyPoint++ % world.mapEnergySpawnPoints.length;
    const point = world.mapEnergySpawnPoints[pointIndex];
    if (!point) continue;
    const occupied = [...world.energy.values()].some((energy) => distanceSquared(energy, point) < 4);
    const blocked = world.mapWalls.query({ x: point.x - ENERGY_RADIUS, y: point.y - ENERGY_RADIUS, width: ENERGY_RADIUS * 2, height: ENERGY_RADIUS * 2 })
      .some((wall) => circleHitsRect(point, ENERGY_RADIUS, wall));
    if (!occupied && !blocked) {
      const id = `energy-${world.nextEnergyId++}`;
      world.energy.set(id, { id, x: point.x, y: point.y });
      return true;
    }
  }
  return false;
}

function respawnPlayer(world: GameWorld, player: WorldPlayer): void {
  const spawn = chooseSafeSpawn(world, player.id);
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.health = player.maxHealth;
  player.skillShieldHealth = 0;
  player.skillShieldUntil = 0;
  player.alive = true;
  player.respawnAt = null;
  player.shieldUntil = world.now + SPAWN_SHIELD_MS;
  player.nextFireAt = world.now;
  player.lastCombatAt = world.now;
  player.regenAccumulatorMs = 0;
  player.mapHealingAccumulatorMs = 0;
  clearAllStatusEffects(player.statusEffects);
}

function markCombat(player: WorldPlayer, now: number): void {
  player.lastCombatAt = now;
  player.regenAccumulatorMs = 0;
}

function advanceCrystalHealing(world: GameWorld, intervalStart: number, intervalEnd: number): void {
  const healingPerSecond = MAP_MECHANICS["crystal-ruins"].effect.healingPerSecond;
  const pointIntervalMs = 1_000 / healingPerSecond;
  for (const player of world.players.values()) {
    const effect = player.statusEffects.get("crystal-resonance");
    if (!player.alive || !effect) {
      player.mapHealingAccumulatorMs = 0;
      continue;
    }
    const activeStart = Math.max(intervalStart, effect.startedAt);
    const activeEnd = Math.min(intervalEnd, effect.expiresAt);
    if (activeEnd > activeStart) player.mapHealingAccumulatorMs += activeEnd - activeStart;
    const points = Math.floor(player.mapHealingAccumulatorMs / pointIntervalMs);
    if (points > 0) {
      player.mapHealingAccumulatorMs -= points * pointIntervalMs;
      const healed = Math.min(points * player.receivedHealingMultiplier, player.maxHealth - player.health);
      player.health += healed;
      player.healingDone = (player.healingDone ?? 0) + healed;
      player.mapMechanicContribution!.mechanicHealing += healed;
    }
    if (intervalEnd >= effect.expiresAt) player.mapHealingAccumulatorMs = 0;
  }
}

function advanceCombatRegeneration(world: GameWorld, deltaMs: number): void {
  const pointIntervalMs = 1_000 / COMBAT_REGEN_PER_SECOND;
  for (const player of world.players.values()) {
    if (!player.alive || player.health >= player.maxHealth) {
      player.regenAccumulatorMs = 0;
      continue;
    }
    if (world.now - player.lastCombatAt < COMBAT_REGEN_DELAY_MS + player.regenDelayAddMs) continue;
    player.regenAccumulatorMs += deltaMs;
    const points = Math.floor(player.regenAccumulatorMs / pointIntervalMs);
    if (points <= 0) continue;
    player.regenAccumulatorMs -= points * pointIntervalMs;
    player.health = Math.min(player.maxHealth, player.health + points);
  }
}

function chooseSafeSpawn(world: GameWorld, playerId: string): Vec2 {
  const enemies = [...world.players.values()].filter((player) => player.id !== playerId && player.alive);
  const spawnPoints = world.mapSpawnPoints;
  if (enemies.length === 0) return spawnPoints[0] ?? { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };

  return spawnPoints.reduce((best, candidate) => {
    const candidateSafety = Math.min(...enemies.map((enemy) => distanceSquared(candidate, enemy)));
    const bestSafety = Math.min(...enemies.map((enemy) => distanceSquared(best, enemy)));
    return candidateSafety > bestSafety ? candidate : best;
  });
}

function resolvePlayerSeparation(world: GameWorld): void {
  const alivePlayers = [...world.players.values()].filter((player) => player.alive);
  for (let pass = 0; pass < Math.max(8, alivePlayers.length * 32); pass += 1) {
    let foundOverlap = false;
    for (let leftIndex = 0; leftIndex < alivePlayers.length; leftIndex += 1) {
      const left = alivePlayers[leftIndex];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < alivePlayers.length; rightIndex += 1) {
        const right = alivePlayers[rightIndex];
        if (!right) continue;
        foundOverlap = separatePlayerPair(world, left, right) || foundOverlap;
      }
    }
    if (!foundOverlap) break;
  }
}

function separatePlayerPair(world: GameWorld, left: WorldPlayer, right: WorldPlayer): boolean {
  const requiredDistance = PLAYER_RADIUS * 2 + 0.001;
  let dx = right.x - left.x;
  let dy = right.y - left.y;
  let distance = Math.hypot(dx, dy);
  if (distance >= requiredDistance) return false;

  let direction = distance === 0 ? { x: 1, y: 0 } : { x: dx / distance, y: dy / distance };
  const correction = requiredDistance - distance;
  const leftNext = safePlayerPosition(world, left, {
    x: -direction.x * correction * 0.5,
    y: -direction.y * correction * 0.5,
  });
  const rightNext = safePlayerPosition(world, right, {
    x: direction.x * correction * 0.5,
    y: direction.y * correction * 0.5,
  });
  left.x = leftNext.x;
  left.y = leftNext.y;
  right.x = rightNext.x;
  right.y = rightNext.y;

  dx = right.x - left.x;
  dy = right.y - left.y;
  distance = Math.hypot(dx, dy);
  if (distance < requiredDistance) {
    direction = distance === 0 ? { x: 1, y: 0 } : { x: dx / distance, y: dy / distance };
    const residual = requiredDistance - distance;
    const leftResidual = safePlayerPosition(world, left, {
      x: -direction.x * residual,
      y: -direction.y * residual,
    });
    left.x = leftResidual.x;
    left.y = leftResidual.y;
  }

  dx = right.x - left.x;
  dy = right.y - left.y;
  distance = Math.hypot(dx, dy);
  if (distance < requiredDistance) {
    direction = distance === 0 ? { x: 1, y: 0 } : { x: dx / distance, y: dy / distance };
    const residual = requiredDistance - distance;
    const rightResidual = safePlayerPosition(world, right, {
      x: direction.x * residual,
      y: direction.y * residual,
    });
    right.x = rightResidual.x;
    right.y = rightResidual.y;
  }

  return true;
}

function movementBounds(start: Vec2, delta: Vec2, padding = PLAYER_RADIUS) {
  const minX = Math.min(start.x, start.x + delta.x) - padding;
  const minY = Math.min(start.y, start.y + delta.y) - padding;
  return {
    x: minX,
    y: minY,
    width: Math.abs(delta.x) + padding * 2,
    height: Math.abs(delta.y) + padding * 2,
  };
}

function safePlayerPosition(world: GameWorld, player: WorldPlayer, delta: Vec2): Vec2 {
  return moveCircleSafely(
    player,
    delta,
    PLAYER_RADIUS,
    world.mapWalls.query(movementBounds(player, delta)),
    { width: ARENA_WIDTH, height: ARENA_HEIGHT },
  );
}

function finishNormalTime(world: GameWorld): void {
  if (isCaptureMode(world.matchMode)) {
    const leadingTeams = leadingCaptureTeamIds(world);
    if (leadingTeams.length === 1) finishWorldMatch(world, playerIdsForTeam(world, leadingTeams[0]!));
    else {
      world.phase = "overtime";
      world.overtimePlayerIds = leadingTeams.flatMap((teamId) => playerIdsForTeam(world, teamId));
    }
    return;
  }
  const leaders = world.matchMode === "solo" ? leadingSoloPlayerIds(world) : leadingTeamPlayerIds(world);
  if (world.matchMode !== "solo") {
    const leadingTeams = leadingTeamIds(world);
    if (leadingTeams.length === 1) {
      finishWorldMatch(world, playerIdsForTeam(world, leadingTeams[0]!));
      return;
    }
  }
  if (leaders.length === 1) {
    finishWorldMatch(world, leaders);
    return;
  }
  world.phase = "overtime";
  world.overtimePlayerIds = leaders;
  world.holderId = null;
  world.holdRemainingMs = null;
}

function handleScoreChange(world: GameWorld, scorerId: string): void {
  if (world.phase === "finished") return;
  if (isCaptureMode(world.matchMode)) return;
  if (world.phase === "overtime" && world.overtimePlayerIds.includes(scorerId)) {
    const scorer = world.players.get(scorerId);
    finishWorldMatch(world, world.matchMode !== "solo" && scorer?.teamId ? playerIdsForTeam(world, scorer.teamId) : [scorerId]);
    return;
  }
  if (world.phase === "playing") refreshHolder(world);
}

function addPlayerScore(world: GameWorld, player: WorldPlayer, amount: number): void {
  player.score += amount;
  if (player.teamId != null) world.teamScores.set(player.teamId, (world.teamScores.get(player.teamId) ?? 0) + amount);
}

function leadingSoloPlayerIds(world: GameWorld): string[] {
  const highestScore = Math.max(...[...world.players.values()].map((player) => player.score));
  return [...world.players.values()].filter((player) => player.score === highestScore).map((player) => player.id);
}

function leadingTeamIds(world: GameWorld): TeamId[] {
  const highestScore = Math.max(...world.teamScores.values());
  return [...world.teamScores].filter(([, score]) => score === highestScore).map(([teamId]) => teamId);
}

function leadingCaptureTeamIds(world: GameWorld): TeamId[] {
  const highestScore = Math.max(...world.captureScores.values());
  return [...world.captureScores].filter(([, score]) => score === highestScore).map(([teamId]) => teamId);
}

function leadingTeamPlayerIds(world: GameWorld): string[] {
  const teams = new Set(leadingTeamIds(world));
  return [...world.players.values()].filter((player) => player.teamId != null && teams.has(player.teamId)).map((player) => player.id);
}

function playerIdsForTeam(world: GameWorld, teamId: TeamId): string[] {
  return [...world.players.values()].filter((player) => player.teamId === teamId).map((player) => player.id);
}

function refreshHolder(world: GameWorld): void {
  const players = [...world.players.values()];
  const leader = world.matchMode === "solo"
    ? (() => {
        const leaderIds = leadingSoloPlayerIds(world);
        return leaderIds.length === 1 ? world.players.get(leaderIds[0]!) ?? null : null;
      })()
    : (() => {
        const teams = leadingTeamIds(world);
        if (teams.length !== 1) return null;
        return players
          .filter((player) => player.teamId === teams[0])
          .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
      })();
  const leaderScore = world.matchMode === "solo" ? leader?.score ?? 0 : leader?.teamId ? world.teamScores.get(leader.teamId) ?? 0 : 0;
  if (!leader || leaderScore < (world.matchMode === "solo" ? TARGET_SCORE : getModeDefinition(world.matchMode).targetScore)) {
    world.holderId = null;
    world.holdRemainingMs = null;
    return;
  }

  if (world.holderId !== leader.id || world.holdRemainingMs === null) {
    world.holderId = leader.id;
    world.holdRemainingMs = HOLD_DURATION_MS;
  }
}

function advanceHold(world: GameWorld, deltaMs: number): void {
  if (world.phase !== "playing") return;
  if (world.holderId === null || world.holdRemainingMs === null) return;
  const previousHolderId = world.holderId;
  refreshHolder(world);
  if (world.holderId !== previousHolderId || world.holdRemainingMs === null) return;

  world.holdRemainingMs = Math.max(0, world.holdRemainingMs - deltaMs);
  if (world.holdRemainingMs === 0) {
    const holder = world.players.get(world.holderId);
    finishWorldMatch(world, world.matchMode !== "solo" && holder?.teamId ? playerIdsForTeam(world, holder.teamId) : [world.holderId]);
  }
}

function isFinished(world: GameWorld): boolean {
  return world.phase === "finished";
}

export function finishWorldMatch(world: GameWorld, winnerIds: string[]): void {
  advanceHighlightTracker(world.matchHighlightTracker, world.now, alivePlayerIds(world));
  world.phase = "finished";
  world.winnerIds = winnerIds;
  world.finishedAt = world.now;
  const mvp = selectMatchMvp([...world.players.values()]);
  world.matchMvpId = mvp.playerId;
  world.matchMvpScore = mvp.score;
  world.matchHighlights = finalizeMatchHighlights(world.matchHighlightTracker, {
    winnerIds,
    players: [...world.players.values()].map((player) => ({
      id: player.id,
      nickname: player.nickname,
      teamId: player.teamId,
    })),
  });
  world.projectiles.clear();
  world.mapMechanicState = null;
  world.mapEventState = null;
  for (const player of world.players.values()) {
    const endedExclusiveSkill = clearExclusiveSkillState(player);
    if (endedExclusiveSkill) recordExclusiveSkillEnd(world, player, endedExclusiveSkill, "reset");
    player.input = { ...EMPTY_INPUT, seq: player.lastProcessedInput };
    player.vx = 0;
    player.vy = 0;
  }
}

function alivePlayerIds(world: GameWorld): string[] {
  return [...world.players.values()].filter((player) => player.alive).map((player) => player.id);
}

function recordExclusiveSkillEvent(
  world: GameWorld,
  input: Omit<ExclusiveSkillEvent, "eventSeq" | "serverTime">,
): void {
  appendPresentationEvent(world.exclusiveSkillEvents, {
    ...input,
    origin: { ...input.origin },
    target: { ...input.target },
    metadata: input.metadata ? {
      healedTargetIds: input.metadata.healedTargetIds ? [...input.metadata.healedTargetIds] : undefined,
      cleansedTargetIds: input.metadata.cleansedTargetIds ? [...input.metadata.cleansedTargetIds] : undefined,
      affectedTargetIds: input.metadata.affectedTargetIds ? [...input.metadata.affectedTargetIds] : undefined,
    } : undefined,
    eventSeq: world.nextExclusiveSkillEventSeq++,
    serverTime: world.now,
  }, EXCLUSIVE_SKILL_EVENT_CAPACITY);
}

function recordProjectileImpact(
  world: GameWorld,
  projectile: WorldProjectile,
  kind: ProjectileImpactEvent["kind"],
  position: Vec2,
  targetId: string | null,
): void {
  appendPresentationEvent(world.projectileImpactEvents, {
    eventSeq: world.nextProjectileImpactEventSeq++,
    serverTime: world.now,
    projectileId: projectile.id,
    ownerId: projectile.ownerId,
    targetId,
    kind,
    position: { ...position },
  }, PROJECTILE_IMPACT_EVENT_CAPACITY);
}

function recordExclusiveSkillEnd(
  world: GameWorld,
  player: WorldPlayer,
  state: ExclusiveRuntimeState,
  reason: NonNullable<ExclusiveSkillEvent["reason"]>,
): void {
  recordExclusiveSkillEvent(world, {
    playerId: player.id,
    skillId: state.skillId,
    stage: "end",
    origin: { x: player.x, y: player.y },
    target: state.movementTarget ?? state.anchor ?? { x: player.x, y: player.y },
    reason,
  });
}

export function forceWorldWinner(world: GameWorld, playerId: string): boolean {
  const player = world.players.get(playerId);
  if (world.phase === "finished" || !player) return false;
  // Keep the scoreboard and winnerIds consistent so every client renders the same winner.
  player.score = Math.max(player.score, TARGET_SCORE);
  finishWorldMatch(world, [playerId]);
  return true;
}

export function forceWorldTeamWinner(world: GameWorld, teamId: TeamId): boolean {
  if (world.phase === "finished") return false;
  const winnerIds = playerIdsForTeam(world, teamId);
  if (winnerIds.length === 0) return false;
  finishWorldMatch(world, winnerIds);
  return true;
}
