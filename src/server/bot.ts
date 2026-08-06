import { distanceSquared, normalize } from "../shared/math";
import type { PlayerInput, Vec2 } from "../shared/protocol";
import type { GameWorld, WorldPlayer } from "./simulation";

const RETREAT_HEALTH = 35;
const RETREAT_DISTANCE_SQUARED = 500 * 500;
const FIRE_DISTANCE_SQUARED = 520 * 520;
const DASH_MIN_DISTANCE_SQUARED = 420 * 420;
const DASH_MAX_DISTANCE_SQUARED = 900 * 900;

export interface BotDecision {
  input: PlayerInput;
  useSkill: boolean;
}

export function chooseBotDecision(
  world: GameWorld,
  playerId: string,
  random: () => number = Math.random,
): BotDecision {
  const player = world.players.get(playerId);
  if (!player?.alive || world.phase === "finished") return { input: idleInput(player), useSkill: false };

  const enemy = nearestPlayer(player, [...world.players.values()].filter((candidate) => candidate.id !== player.id && candidate.alive));
  const energy = nearestPoint(player, [...world.energy.values()]);
  const skillOrb = nearestPoint(player, [...world.skillSystem.orbs.values()]);
  const enemyDistance = enemy ? distanceSquared(player, enemy) : Number.POSITIVE_INFINITY;
  const energyDistance = energy ? distanceSquared(player, energy) : Number.POSITIVE_INFINITY;

  let movement: Vec2 = { x: 0, y: 0 };
  if (enemy && player.health <= RETREAT_HEALTH && enemyDistance <= RETREAT_DISTANCE_SQUARED) {
    movement = normalize({ x: player.x - enemy.x, y: player.y - enemy.y });
  } else if (skillOrb) {
    movement = normalize({ x: skillOrb.x - player.x, y: skillOrb.y - player.y });
  } else if (energy && (!enemy || energyDistance < enemyDistance * 0.8)) {
    movement = normalize({ x: energy.x - player.x, y: energy.y - player.y });
  } else if (enemy) {
    movement = normalize({ x: enemy.x - player.x, y: enemy.y - player.y });
  }

  const aim = enemy ? imperfectAim(player, enemy, random) : movement;
  const heldSkill = player.skillSlot.charges === 1 ? player.skillSlot.type : null;
  const useSkill = heldSkill === "heal"
    ? player.health <= 45
    : heldSkill === "shield"
      ? Boolean(enemy && player.health <= 70 && enemyDistance <= RETREAT_DISTANCE_SQUARED)
      : heldSkill === "spread"
        ? Boolean(enemy && enemyDistance <= FIRE_DISTANCE_SQUARED)
        : heldSkill === "dash"
          ? Boolean(enemy && player.health > RETREAT_HEALTH && enemyDistance >= DASH_MIN_DISTANCE_SQUARED && enemyDistance <= DASH_MAX_DISTANCE_SQUARED)
          : false;

  if (useSkill && heldSkill === "dash" && enemy) {
    movement = normalize({ x: enemy.x - player.x, y: enemy.y - player.y });
  }

  return {
    useSkill,
    input: {
      seq: player.lastProcessedInput + 1,
      moveX: movement.x,
      moveY: movement.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: Boolean(enemy && enemyDistance <= FIRE_DISTANCE_SQUARED),
    },
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

function imperfectAim(origin: Vec2, target: Vec2, random: () => number): Vec2 {
  const perfectAngle = Math.atan2(target.y - origin.y, target.x - origin.x);
  const error = (random() - 0.5) * 0.44;
  return { x: Math.cos(perfectAngle + error), y: Math.sin(perfectAngle + error) };
}
