import { describe, expect, it } from "vitest";

import {
  ENERGY_SCORE,
  MATCH_DURATION_MS,
  MAX_HEALTH,
  PLAYER_RADIUS,
  PROJECTILE_DAMAGE,
  RESPAWN_DELAY_MS,
  SPAWN_SHIELD_MS,
  TARGET_SCORE,
  WALLS,
} from "../src/shared/constants";
import { circleHitsCircle, circleHitsRect } from "../src/shared/math";
import {
  applyPlayerInput,
  collectEnergy,
  createGameWorld,
  damagePlayer,
  stepWorld,
} from "../src/server/simulation";

function createWorld() {
  return createGameWorld([
    { id: "red", nickname: "红方", color: "#ff5a5f", isBot: false },
    { id: "blue", nickname: "蓝方", color: "#4da3ff", isBot: false },
  ]);
}

describe("authoritative simulation", () => {
  it("awards two points for a defeat and respawns the victim", () => {
    const world = createWorld();
    stepWorld(world, SPAWN_SHIELD_MS + 1);

    damagePlayer(world, "blue", "red", MAX_HEALTH);

    expect(world.players.get("red")?.score).toBe(2);
    expect(world.players.get("red")?.kills).toBe(1);
    expect(world.players.get("blue")?.alive).toBe(false);

    stepWorld(world, RESPAWN_DELAY_MS + 1);

    expect(world.players.get("blue")?.alive).toBe(true);
    expect(world.players.get("blue")?.health).toBe(MAX_HEALTH);
  });

  it("collects energy and ends immediately at fifteen points", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.score = TARGET_SCORE - ENERGY_SCORE;
    const energyId = [...world.energy.keys()][0]!;

    collectEnergy(world, "red", energyId);

    expect(player.energyCollected).toBe(1);
    expect(player.score).toBe(TARGET_SCORE);
    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red"]);
  });

  it("enters overtime for tied leaders and ends on their next score", () => {
    const world = createWorld();
    world.players.get("red")!.score = 8;
    world.players.get("blue")!.score = 8;

    stepWorld(world, MATCH_DURATION_MS);

    expect(world.phase).toBe("overtime");
    expect(world.overtimePlayerIds.sort()).toEqual(["blue", "red"]);

    const energyId = [...world.energy.keys()][0]!;
    collectEnergy(world, "red", energyId);

    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red"]);
  });

  it("normalizes movement input before applying speed", () => {
    const world = createWorld();
    const player = world.players.get("red")!;

    applyPlayerInput(world, "red", {
      seq: 1,
      moveX: 1,
      moveY: 1,
      aimX: 0,
      aimY: 0,
      firing: false,
    });
    stepWorld(world, 50);

    expect(Math.hypot(player.vx, player.vy)).toBeLessThanOrEqual(265.001);
    expect(player.lastProcessedInput).toBe(1);
  });

  it("depenetrates a player that starts inside a wall", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.x = 945;
    player.y = 500;
    player.shieldUntil = 0;

    stepWorld(world, 16);

    expect(WALLS.some((wall) => circleHitsRect(player, PLAYER_RADIUS, wall))).toBe(false);
  });

  it("separates players without pushing either one into a wall", () => {
    const world = createWorld();
    const left = world.players.get("red")!;
    const right = world.players.get("blue")!;
    left.x = 900;
    left.y = 500;
    right.x = 930;
    right.y = 500;
    left.shieldUntil = 0;
    right.shieldUntil = 0;

    stepWorld(world, 16);

    expect(circleHitsCircle(left, PLAYER_RADIUS, right, PLAYER_RADIUS)).toBe(false);
    expect(WALLS.some((wall) => circleHitsRect(left, PLAYER_RADIUS, wall))).toBe(false);
    expect(WALLS.some((wall) => circleHitsRect(right, PLAYER_RADIUS, wall))).toBe(false);
  });

  it("separates overlapping players when one is pinned to the arena boundary", () => {
    const world = createWorld();
    const left = world.players.get("red")!;
    const right = world.players.get("blue")!;
    left.x = PLAYER_RADIUS;
    left.y = 200;
    right.x = PLAYER_RADIUS + 13;
    right.y = 200;
    left.shieldUntil = 0;
    right.shieldUntil = 0;

    stepWorld(world, 16);

    expect(circleHitsCircle(left, PLAYER_RADIUS, right, PLAYER_RADIUS)).toBe(false);
    expect(left.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(right.x).toBeLessThanOrEqual(2160 - PLAYER_RADIUS);
  });

  it("fully separates a six-player cluster at the arena boundary", () => {
    const world = createGameWorld(Array.from({ length: 6 }, (_, index) => ({
      id: `player-${index}`,
      nickname: `P${index}`,
      color: "#ffffff",
      isBot: false,
    })));
    const players = [...world.players.values()];
    players.forEach((player, index) => {
      player.x = PLAYER_RADIUS + index * 5;
      player.y = 200;
      player.shieldUntil = 0;
    });

    stepWorld(world, 16);

    for (let leftIndex = 0; leftIndex < players.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < players.length; rightIndex += 1) {
        expect(Math.hypot(
          players[leftIndex]!.x - players[rightIndex]!.x,
          players[leftIndex]!.y - players[rightIndex]!.y,
        )).toBeGreaterThan(PLAYER_RADIUS * 2);
      }
    }
  });

  it("destroys a projectile at the first wall crossed in one frame", () => {
    const world = createWorld();
    const target = world.players.get("blue")!;
    target.x = 1300;
    target.y = 500;
    target.shieldUntil = 0;
    world.projectiles.set("tunneling", {
      id: "tunneling",
      ownerId: "red",
      x: 900,
      y: 500,
      vx: 5000,
      vy: 0,
      expiresAt: world.now + 1000,
    });

    stepWorld(world, 100);

    expect(target.health).toBe(MAX_HEALTH);
    expect(world.projectiles.size).toBe(0);
  });

  it("resolves a player hit before a later wall and applies one damage event", () => {
    const world = createWorld();
    const target = world.players.get("blue")!;
    target.x = 900;
    target.y = 500;
    target.shieldUntil = 0;
    world.projectiles.set("player-first", {
      id: "player-first",
      ownerId: "red",
      x: 850,
      y: 500,
      vx: 5000,
      vy: 0,
      expiresAt: world.now + 1000,
    });

    stepWorld(world, 100);

    expect(target.health).toBe(MAX_HEALTH - PROJECTILE_DAMAGE);
    expect(world.projectiles.size).toBe(0);
  });
});
