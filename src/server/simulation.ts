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
import { getModeDefinition, isCaptureMode, TEAM_IDS, type MatchMode, type TeamId } from "../shared/mode-catalog";
import { advanceCapturePoint, createCapturePointState, DEFAULT_CAPTURE_POINT_CONFIG, isCapturePointComplete, type CapturePointState } from "../shared/capture-point";
import { applyExclusiveSkill, advanceExclusiveSkillEffects, clearExclusiveSkillState, isExclusiveEffectActive, type ExclusiveRuntimeState } from "./exclusive-skill-system";
import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import type { SkillType } from "../shared/skill-catalog";
import { firstWallHit, moveCircleSafely, moveCircleUntilBlocked, sweepCircleCircle } from "../shared/collision";
import { StaticSpatialIndex } from "../shared/spatial-index";
import { circleHitsCircle, clamp, distanceSquared, normalize } from "../shared/math";
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
  GamePhase,
  GameSnapshot,
  KillFeedEvent,
  PlayerInput,
  PlayerSnapshot,
  ProjectileSnapshot,
  Vec2,
} from "../shared/protocol";

export interface PlayerSeed {
  id: string;
  nickname: string;
  characterId: CharacterId;
  isBot: boolean;
  stats?: Partial<AdminStats>;
  teamId?: TeamId | null;
}

export interface WorldPlayer extends PlayerSnapshot {
  input: PlayerInput;
  nextFireAt: number;
  lastCombatAt: number;
  regenAccumulatorMs: number;
  killStreak: number;
  exclusiveSkillState?: ExclusiveRuntimeState | null;
}

export interface WorldProjectile extends ProjectileSnapshot {
  distanceTraveled: number;
  damage?: number;
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
  matchMode: MatchMode;
  teamScores: Map<TeamId, number>;
  captureScores: Map<TeamId, number>;
  capturePoint: CapturePointState | null;
}

const EMPTY_INPUT: PlayerInput = {
  seq: 0,
  moveX: 0,
  moveY: 0,
  aimX: 1,
  aimY: 0,
  firing: false,
};

const WALL_INDEX = new StaticSpatialIndex(WALLS);

export function createGameWorld(seeds: readonly PlayerSeed[], now = 0, matchMode: MatchMode = "solo"): GameWorld {
  const players = new Map<string, WorldPlayer>();
  seeds.forEach((seed, index) => {
    const character = getCharacter(seed.characterId);
    const spawn = SPAWN_POINTS[index % SPAWN_POINTS.length] ?? { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    const maxHealth = Math.max(seed.stats?.maxHealth ?? character.maxHealth, seed.stats?.health ?? 0);
    const health = Math.min(seed.stats?.health ?? maxHealth, maxHealth);
    players.set(seed.id, {
      id: seed.id,
      nickname: seed.nickname,
      characterId: seed.characterId,
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
      projectileSpeed: seed.stats?.projectileSpeed ?? character.projectileSpeed,
      score: seed.stats?.score ?? 0,
      kills: seed.stats?.kills ?? 0,
      energyCollected: seed.stats?.energyCollected ?? 0,
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
      killStreak: 0,
      teamId: seed.teamId ?? null,
      exclusiveSkillCooldownMs: seed.stats?.exclusiveSkillCooldownMs ?? DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS,
      exclusiveSkillReadyAt: now,
      exclusiveSkillState: null,
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
    players,
    projectiles: new Map(),
    energy: new Map(),
    skillSystem: createSkillSystem(now),
    nextProjectileId: 1,
    nextEnergyId: 1,
    nextEnergySpawnAt: now,
    nextEnergyPoint: 0,
    killFeed: [],
    nextKillFeedId: 1,
    matchMode,
    teamScores: new Map(
      TEAM_IDS.slice(0, getModeDefinition(matchMode).teamCount).map((teamId) => [teamId, 0] as const),
    ),
    captureScores: new Map(
      TEAM_IDS.slice(0, getModeDefinition(matchMode).teamCount).map((teamId) => [teamId, 0] as const),
    ),
    capturePoint: isCaptureMode(matchMode) ? createCapturePointState() : null,
  };

  while (world.energy.size < MAX_ENERGY) spawnEnergy(world);
  seedInitialSkillOrbs(world.skillSystem, [...players.values()]);
  return world;
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
  world.now += simulationDelta;

  if (world.phase === "playing") {
    world.remainingMs = Math.max(0, world.remainingMs - simulationDelta);
  }

  advanceHold(world, simulationDelta);
  if (isFinished(world)) return;

  for (const player of world.players.values()) {
    if (player.skillShieldUntil <= world.now) player.skillShieldHealth = 0;
    if (!player.alive) {
      if (player.respawnAt !== null && world.now >= player.respawnAt) respawnPlayer(world, player);
      continue;
    }
    movePlayer(world, player, simulationDelta);
    updateAimAndFire(world, player);
  }

  resolvePlayerSeparation(world);
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
  advanceExclusiveSkillEffects([...world.players.values()], world.now);
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
  if (world.phase === "finished") return false;
  const victim = world.players.get(victimId);
  if (!victim?.alive || victim.shieldUntil > world.now || amount <= 0 || !Number.isFinite(amount)) return false;

  const attacker = world.players.get(attackerId);
  if (attacker && attacker.id !== victim.id && attacker.teamId !== null && attacker.teamId === victim.teamId) {
    return false;
  }
  markCombat(victim, world.now);
  if (attacker && attacker.id !== victim.id) markCombat(attacker, world.now);

  if (victim.skillShieldUntil <= world.now) victim.skillShieldHealth = 0;
  const reducedAmount = attacker && isExclusiveEffectActive(victim, "mobile-bulwark", world.now) && isInFront(victim, attacker) ? amount * 0.45 : amount;
  const absorbed = Math.min(victim.skillShieldHealth, reducedAmount);
  victim.skillShieldHealth -= absorbed;
  const healthDamage = reducedAmount - absorbed;
  if (healthDamage === 0) return true;
  victim.health = Math.max(0, victim.health - healthDamage);
  if (victim.health > 0) return true;

  victim.alive = false;
  victim.vx = 0;
  victim.vy = 0;
  victim.respawnAt = world.now + RESPAWN_DELAY_MS;
  victim.input = { ...EMPTY_INPUT, seq: victim.lastProcessedInput };
  victim.skillShieldHealth = 0;
  victim.skillShieldUntil = 0;
  victim.killStreak = 0;
  clearSkillSlot(victim);
  clearExclusiveSkillState(victim);

  if (attacker && attacker.id !== victim.id) {
    attacker.killStreak += 1;
    world.killFeed.push({
      id: `kill-${world.nextKillFeedId++}`,
      at: world.now,
      killerId: attacker.id,
      victimId: victim.id,
      streak: attacker.killStreak,
    });
    if (world.killFeed.length > 6) world.killFeed.splice(0, world.killFeed.length - 6);
    addPlayerScore(world, attacker, KILL_SCORE + (world.holderId === victim.id ? HOLDER_KILL_BONUS : 0));
    attacker.kills += 1;
    handleScoreChange(world, attacker.id);
  }
  return true;
}

export function collectEnergy(world: GameWorld, playerId: string, energyId: string): boolean {
  if (world.phase === "finished") return false;
  const player = world.players.get(playerId);
  if (!player?.alive || !world.energy.delete(energyId)) return false;

  addPlayerScore(world, player, ENERGY_SCORE);
  player.energyCollected += 1;
  if (player.characterId === "medic") {
    player.health = Math.min(player.maxHealth, player.health + MEDIC_ENERGY_HEAL);
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
  if (consumed) clearSkillSlot(player);
  return true;
}

export function applyWorldExclusiveSkill(world: GameWorld, playerId: string, direction: Vec2): boolean {
  if (world.phase === "finished") return false;
  const player = world.players.get(playerId);
  if (!player) return false;
  const result = applyExclusiveSkill(player, world.now, direction);
  if (!result.ok) return false;
  if (result.definition.id === "pulse-heal") {
    for (const ally of world.players.values()) {
      if (ally.id !== player.id && ally.alive && ally.teamId !== null && ally.teamId === player.teamId && distanceSquared(ally, player) <= 280 * 280) {
        ally.health = Math.min(ally.maxHealth, ally.health + 30);
      }
    }
  }
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
    players: [...world.players.values()].map(({ input: _input, nextFireAt: _nextFireAt, lastCombatAt: _lastCombatAt, regenAccumulatorMs: _regenAccumulatorMs, killStreak: _killStreak, ...player }) => player),
    projectiles: [...world.projectiles.values()].map(({ distanceTraveled: _distanceTraveled, damage: _damage, ...projectile }) => projectile),
    energy: [...world.energy.values()],
    skillOrbs: [...world.skillSystem.orbs.values()],
    killFeed: [...world.killFeed],
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
      x: DEFAULT_CAPTURE_POINT_CONFIG.center.x,
      y: DEFAULT_CAPTURE_POINT_CONFIG.center.y,
      radius: DEFAULT_CAPTURE_POINT_CONFIG.radius,
      ownerTeamId: world.capturePoint.ownerTeamId,
      progress: world.capturePoint.progress,
      targetProgress: DEFAULT_CAPTURE_POINT_CONFIG.targetProgress,
      contestingTeams: [...world.capturePoint.contestingTeams],
      state: world.capturePoint.state,
    } : null,
  };
}

function advanceWorldCapturePoint(world: GameWorld, deltaMs: number): void {
  if (!world.capturePoint || world.phase === "finished") return;
  world.capturePoint = advanceCapturePoint(world.capturePoint, [...world.players.values()], deltaMs);
  if (world.capturePoint.state !== "owned" || !world.capturePoint.ownerTeamId || !world.capturePoint.contestingTeams.includes(world.capturePoint.ownerTeamId)) return;
  const teamId = world.capturePoint.ownerTeamId;
  const score = Math.min(
    DEFAULT_CAPTURE_POINT_CONFIG.targetProgress,
    (world.captureScores.get(teamId) ?? 0) + deltaMs / 1_000,
  );
  world.captureScores.set(teamId, score);
  if (isCapturePointComplete(score)) finishMatch(world, playerIdsForTeam(world, teamId));
}

function executeSkill(world: GameWorld, player: WorldPlayer, skill: SkillType): boolean {
  if (!player.alive) return false;
  switch (skill) {
    case "dash":
      return executeDash(world, player);
    case "shield":
      player.skillShieldHealth = SHIELD_STRENGTH;
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
      player.health = Math.min(player.maxHealth, player.health + HEAL_AMOUNT);
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
    WALL_INDEX.query(movementBounds(player, delta)),
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
  return (Math.cos(defender.angle) * deltaX + Math.sin(defender.angle) * deltaY) / length >= 0;
}

function movePlayer(world: GameWorld, player: WorldPlayer, deltaMs: number): void {
  const direction = normalize({ x: player.input.moveX, y: player.input.moveY });
  const speedMultiplier = isExclusiveEffectActive(player, "capacitor-overload", world.now) ? 1.2 : isExclusiveEffectActive(player, "afterimage-run", world.now) ? 1.35 : 1;
  player.vx = direction.x * player.moveSpeed * speedMultiplier;
  player.vy = direction.y * player.moveSpeed * speedMultiplier;
  const seconds = deltaMs / 1_000;
  const delta = { x: player.vx * seconds, y: player.vy * seconds };
  const nearbyWalls = WALL_INDEX.query(movementBounds(player, delta));
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
      const runnerDamage = isExclusiveEffectActive(player, "afterimage-run", world.now) ? player.damage * 1.2 : player.damage;
      spawnProjectile(world, player, player.angle, runnerDamage);
      const overloadMultiplier = isExclusiveEffectActive(player, "capacitor-overload", world.now) ? 0.7 : 1;
      const fortressSlow = [...world.players.values()].some((enemy) => enemy.alive && enemy.teamId != null && enemy.teamId !== player.teamId && isExclusiveEffectActive(enemy, "mobile-bulwark", world.now) && distanceSquared(enemy, player) <= 240 * 240) ? 1.3 : 1;
      player.nextFireAt = world.now + player.fireCooldownMs * overloadMultiplier * fortressSlow;
    }
  }
}

function spawnProjectile(world: GameWorld, player: WorldPlayer, angle: number, damage: number): void {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const id = `projectile-${world.nextProjectileId++}`;
  world.projectiles.set(id, {
    id,
    ownerId: player.id,
    x: player.x + direction.x * (PLAYER_RADIUS + PROJECTILE_RADIUS + 4),
    y: player.y + direction.y * (PLAYER_RADIUS + PROJECTILE_RADIUS + 4),
    vx: direction.x * player.projectileSpeed,
    vy: direction.y * player.projectileSpeed,
    damage,
    distanceTraveled: 0,
  });
}

function advanceProjectiles(world: GameWorld, deltaMs: number): void {
  for (const projectile of [...world.projectiles.values()]) {
    if (world.phase === "finished") break;
    const speed = Math.hypot(projectile.vx, projectile.vy);
    const requestedDistance = speed * deltaMs / 1_000;
    const remainingDistance = PROJECTILE_MAX_DISTANCE - projectile.distanceTraveled;
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
      PROJECTILE_RADIUS,
      WALL_INDEX.query(movementBounds(projectile, delta, PROJECTILE_RADIUS)),
    );
    let targetHit: { player: WorldPlayer; time: number } | null = null;
    for (const player of world.players.values()) {
      if (player.id === projectile.ownerId || !player.alive) continue;
      const owner = world.players.get(projectile.ownerId);
      if (owner && owner.teamId !== null && owner.teamId === player.teamId) continue;
      const hit = sweepCircleCircle(projectile, delta, PROJECTILE_RADIUS, player, PLAYER_RADIUS);
      if (hit && (!targetHit || hit.time < targetHit.time)) targetHit = { player, time: hit.time };
    }

    if (wallHit && (!targetHit || wallHit.time <= targetHit.time)) {
      world.projectiles.delete(projectile.id);
      continue;
    }
    if (targetHit) {
      const attacker = world.players.get(projectile.ownerId);
      damagePlayer(world, targetHit.player.id, projectile.ownerId, projectile.damage ?? attacker?.damage ?? 0);
      world.projectiles.delete(projectile.id);
      continue;
    }

    projectile.x += delta.x;
    projectile.y += delta.y;
    projectile.distanceTraveled += Math.hypot(delta.x, delta.y);
    if (activeDistance < requestedDistance || projectile.distanceTraveled >= PROJECTILE_MAX_DISTANCE || projectile.x < PROJECTILE_RADIUS || projectile.x > ARENA_WIDTH - PROJECTILE_RADIUS || projectile.y < PROJECTILE_RADIUS || projectile.y > ARENA_HEIGHT - PROJECTILE_RADIUS) {
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

function spawnEnergy(world: GameWorld): void {
  for (let attempt = 0; attempt < ENERGY_SPAWN_POINTS.length; attempt += 1) {
    const pointIndex = world.nextEnergyPoint++ % ENERGY_SPAWN_POINTS.length;
    const point = ENERGY_SPAWN_POINTS[pointIndex];
    if (!point) continue;
    const occupied = [...world.energy.values()].some((energy) => distanceSquared(energy, point) < 4);
    if (!occupied) {
      const id = `energy-${world.nextEnergyId++}`;
      world.energy.set(id, { id, x: point.x, y: point.y });
      return;
    }
  }
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
}

function markCombat(player: WorldPlayer, now: number): void {
  player.lastCombatAt = now;
  player.regenAccumulatorMs = 0;
}

function advanceCombatRegeneration(world: GameWorld, deltaMs: number): void {
  const pointIntervalMs = 1_000 / COMBAT_REGEN_PER_SECOND;
  for (const player of world.players.values()) {
    if (!player.alive || player.health >= player.maxHealth) {
      player.regenAccumulatorMs = 0;
      continue;
    }
    if (world.now - player.lastCombatAt < COMBAT_REGEN_DELAY_MS) continue;
    player.regenAccumulatorMs += deltaMs;
    const points = Math.floor(player.regenAccumulatorMs / pointIntervalMs);
    if (points <= 0) continue;
    player.regenAccumulatorMs -= points * pointIntervalMs;
    player.health = Math.min(player.maxHealth, player.health + points);
  }
}

function chooseSafeSpawn(world: GameWorld, playerId: string): Vec2 {
  const enemies = [...world.players.values()].filter((player) => player.id !== playerId && player.alive);
  if (enemies.length === 0) return SPAWN_POINTS[0] ?? { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };

  return SPAWN_POINTS.reduce((best, candidate) => {
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
    WALL_INDEX.query(movementBounds(player, delta)),
    { width: ARENA_WIDTH, height: ARENA_HEIGHT },
  );
}

function finishNormalTime(world: GameWorld): void {
  if (isCaptureMode(world.matchMode)) {
    const leadingTeams = leadingCaptureTeamIds(world);
    if (leadingTeams.length === 1) finishMatch(world, playerIdsForTeam(world, leadingTeams[0]!));
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
      finishMatch(world, playerIdsForTeam(world, leadingTeams[0]!));
      return;
    }
  }
  if (leaders.length === 1) {
    finishMatch(world, leaders);
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
    finishMatch(world, world.matchMode !== "solo" && scorer?.teamId ? playerIdsForTeam(world, scorer.teamId) : [scorerId]);
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
    finishMatch(world, world.matchMode !== "solo" && holder?.teamId ? playerIdsForTeam(world, holder.teamId) : [world.holderId]);
  }
}

function isFinished(world: GameWorld): boolean {
  return world.phase === "finished";
}

function finishMatch(world: GameWorld, winnerIds: string[]): void {
  world.phase = "finished";
  world.winnerIds = winnerIds;
  world.finishedAt = world.now;
  world.projectiles.clear();
  for (const player of world.players.values()) {
    player.input = { ...EMPTY_INPUT, seq: player.lastProcessedInput };
    player.vx = 0;
    player.vy = 0;
  }
}

export function forceWorldWinner(world: GameWorld, playerId: string): boolean {
  if (world.phase === "finished" || !world.players.has(playerId)) return false;
  finishMatch(world, [playerId]);
  return true;
}

export function forceWorldTeamWinner(world: GameWorld, teamId: TeamId): boolean {
  if (world.phase === "finished") return false;
  const winnerIds = playerIdsForTeam(world, teamId);
  if (winnerIds.length === 0) return false;
  finishMatch(world, winnerIds);
  return true;
}
