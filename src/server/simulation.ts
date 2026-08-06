import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
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
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  RESPAWN_DELAY_MS,
  SKILL_ORB_RADIUS,
  SPAWN_POINTS,
  SPAWN_SHIELD_MS,
  TARGET_SCORE,
  WALLS,
} from "../shared/constants";
import { getCharacter, MEDIC_ENERGY_HEAL, type CharacterId } from "../shared/character-catalog";
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
  type SkillSystemState,
} from "./skill-system";
import type {
  EnergySnapshot,
  GamePhase,
  GameSnapshot,
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
}

export interface WorldPlayer extends PlayerSnapshot {
  input: PlayerInput;
  nextFireAt: number;
}

export interface WorldProjectile extends ProjectileSnapshot {
  expiresAt: number;
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

export function createGameWorld(seeds: readonly PlayerSeed[], now = 0): GameWorld {
  const players = new Map<string, WorldPlayer>();
  seeds.forEach((seed, index) => {
    const character = getCharacter(seed.characterId);
    const spawn = SPAWN_POINTS[index % SPAWN_POINTS.length] ?? { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    players.set(seed.id, {
      ...seed,
      color: character.color,
      connected: !seed.isBot,
      ready: true,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      angle: 0,
      health: character.maxHealth,
      maxHealth: character.maxHealth,
      damage: character.damage,
      moveSpeed: character.moveSpeed,
      fireCooldownMs: character.fireCooldownMs,
      projectileSpeed: character.projectileSpeed,
      score: 0,
      kills: 0,
      energyCollected: 0,
      alive: true,
      respawnAt: null,
      shieldUntil: now + SPAWN_SHIELD_MS,
      skillShieldHealth: 0,
      skillShieldUntil: 0,
      lastProcessedInput: 0,
      skillSlot: { type: null, charges: 0 },
      lastProcessedSkillAction: 0,
      input: { ...EMPTY_INPUT },
      nextFireAt: now,
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
  };

  while (world.energy.size < MAX_ENERGY) spawnEnergy(world);
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
  collectTouchedEnergy(world);
  if (isFinished(world)) return;
  replenishEnergy(world);
  collectTouchedSkillOrbs(world);
  advanceSkillSystem(
    world.skillSystem,
    world.now,
    [...world.players.values()].filter((player) => player.alive),
  );

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

  if (victim.skillShieldUntil <= world.now) victim.skillShieldHealth = 0;
  const absorbed = Math.min(victim.skillShieldHealth, amount);
  victim.skillShieldHealth -= absorbed;
  const healthDamage = amount - absorbed;
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
  clearSkillSlot(victim);

  const attacker = world.players.get(attackerId);
  if (attacker && attacker.id !== victim.id) {
    attacker.score += KILL_SCORE + (world.holderId === victim.id ? HOLDER_KILL_BONUS : 0);
    attacker.kills += 1;
    handleScoreChange(world, attacker.id);
  }
  return true;
}

export function collectEnergy(world: GameWorld, playerId: string, energyId: string): boolean {
  if (world.phase === "finished") return false;
  const player = world.players.get(playerId);
  if (!player?.alive || !world.energy.delete(energyId)) return false;

  player.score += ENERGY_SCORE;
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
    players: [...world.players.values()].map(({ input: _input, nextFireAt: _nextFireAt, ...player }) => player),
    projectiles: [...world.projectiles.values()].map(({ expiresAt: _expiresAt, damage: _damage, ...projectile }) => projectile),
    energy: [...world.energy.values()],
    skillOrbs: [...world.skillSystem.orbs.values()],
  };
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

function movePlayer(world: GameWorld, player: WorldPlayer, deltaMs: number): void {
  const direction = normalize({ x: player.input.moveX, y: player.input.moveY });
  player.vx = direction.x * player.moveSpeed;
  player.vy = direction.y * player.moveSpeed;
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
      spawnProjectile(world, player, player.angle, player.damage);
      player.nextFireAt = world.now + player.fireCooldownMs;
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
    expiresAt: world.now + PROJECTILE_LIFETIME_MS,
  });
}

function advanceProjectiles(world: GameWorld, deltaMs: number): void {
  const frameStart = world.now - deltaMs;
  for (const projectile of [...world.projectiles.values()]) {
    if (world.phase === "finished") break;
    const activeMs = Math.min(deltaMs, projectile.expiresAt - frameStart);
    if (activeMs <= 0) {
      world.projectiles.delete(projectile.id);
      continue;
    }

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
    if (activeMs < deltaMs || projectile.x < PROJECTILE_RADIUS || projectile.x > ARENA_WIDTH - PROJECTILE_RADIUS || projectile.y < PROJECTILE_RADIUS || projectile.y > ARENA_HEIGHT - PROJECTILE_RADIUS) {
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
  const highestScore = Math.max(...[...world.players.values()].map((player) => player.score));
  const leaders = [...world.players.values()].filter((player) => player.score === highestScore).map((player) => player.id);
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
  if (world.phase === "overtime" && world.overtimePlayerIds.includes(scorerId)) {
    finishMatch(world, [scorerId]);
    return;
  }
  if (world.phase === "playing") refreshHolder(world);
}

function refreshHolder(world: GameWorld): void {
  const players = [...world.players.values()];
  const highestScore = Math.max(...players.map((player) => player.score));
  const leaders = players.filter((player) => player.score === highestScore);
  const leader = leaders.length === 1 ? leaders[0] : null;
  if (!leader || leader.score < TARGET_SCORE) {
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
  if (world.holdRemainingMs === 0) finishMatch(world, [world.holderId]);
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
