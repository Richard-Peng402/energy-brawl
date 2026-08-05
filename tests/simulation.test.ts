import { describe, expect, it } from "vitest";

import {
  ARENA_SCALE,
  ARENA_WIDTH,
  ENERGY_SCORE,
  HOLD_DURATION_MS,
  HOLDER_KILL_BONUS,
  KILL_SCORE,
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

const scaleArenaPosition = (value: number) => value * ARENA_SCALE;

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

  it("starts a thirty-second hold for the unique leader at fifteen points", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.score = TARGET_SCORE - ENERGY_SCORE;
    const energyId = [...world.energy.keys()][0]!;

    collectEnergy(world, "red", energyId);

    expect(player.energyCollected).toBe(1);
    expect(player.score).toBe(TARGET_SCORE);
    expect(world.phase).toBe("playing");
    expect(world.holderId).toBe("red");
    expect(world.holdRemainingMs).toBe(HOLD_DURATION_MS);
  });

  it("continues and completes a hold while the holder stays uniquely ahead", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.score = TARGET_SCORE - ENERGY_SCORE;
    collectEnergy(world, "red", [...world.energy.keys()][0]!);

    stepWorld(world, 10_000);

    expect(world.phase).toBe("playing");
    expect(world.holderId).toBe("red");
    expect(world.holdRemainingMs).toBe(HOLD_DURATION_MS - 10_000);

    stepWorld(world, HOLD_DURATION_MS - 10_000);

    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red"]);
    expect(world.finishedAt).toBe(world.now);
  });

  it("does not consume hold time in the frame that creates a new holder", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    const energy = [...world.energy.values()][0]!;
    player.score = TARGET_SCORE - ENERGY_SCORE;
    player.x = energy.x;
    player.y = energy.y;

    stepWorld(world, 1_000);

    expect(world.holderId).toBe("red");
    expect(world.holdRemainingMs).toBe(HOLD_DURATION_MS);
  });

  it("finishes an expiring hold before a later score in the same frame", () => {
    const world = createWorld();
    const holder = world.players.get("red")!;
    const challenger = world.players.get("blue")!;
    holder.score = TARGET_SCORE - ENERGY_SCORE;
    challenger.score = TARGET_SCORE - ENERGY_SCORE;
    collectEnergy(world, "red", [...world.energy.keys()][0]!);
    world.holdRemainingMs = 1;
    const energy = [...world.energy.values()][0]!;
    challenger.x = energy.x;
    challenger.y = energy.y;

    stepWorld(world, 16);

    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red"]);
    expect(challenger.score).toBe(TARGET_SCORE - ENERGY_SCORE);
  });

  it("cancels the hold when another player ties the holder", () => {
    const world = createWorld();
    world.players.get("red")!.score = TARGET_SCORE - ENERGY_SCORE;
    world.players.get("blue")!.score = TARGET_SCORE - ENERGY_SCORE;
    const [firstEnergy, secondEnergy] = [...world.energy.keys()];
    collectEnergy(world, "red", firstEnergy!);

    collectEnergy(world, "blue", secondEnergy!);

    expect(world.holderId).toBeNull();
    expect(world.holdRemainingMs).toBeNull();
    expect(world.phase).toBe("playing");
  });

  it("starts a fresh hold when a different player becomes the unique leader", () => {
    const world = createWorld();
    world.players.get("red")!.score = TARGET_SCORE - ENERGY_SCORE;
    world.players.get("blue")!.score = TARGET_SCORE - ENERGY_SCORE;
    const [firstEnergy, secondEnergy] = [...world.energy.keys()];
    collectEnergy(world, "red", firstEnergy!);
    stepWorld(world, 5_000);
    world.players.get("blue")!.score = TARGET_SCORE;

    collectEnergy(world, "blue", secondEnergy!);

    expect(world.holderId).toBe("blue");
    expect(world.holdRemainingMs).toBe(HOLD_DURATION_MS);
  });

  it("awards an extra point for defeating the active holder", () => {
    const world = createWorld();
    const holder = world.players.get("red")!;
    holder.score = TARGET_SCORE - ENERGY_SCORE;
    collectEnergy(world, "red", [...world.energy.keys()][0]!);
    holder.shieldUntil = 0;

    damagePlayer(world, "red", "blue", MAX_HEALTH);

    expect(world.players.get("blue")!.score).toBe(KILL_SCORE + HOLDER_KILL_BONUS);
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

  it("does not allow scoring or damage after sudden death finishes", () => {
    const world = createWorld();
    world.players.get("red")!.score = 8;
    world.players.get("blue")!.score = 8;
    stepWorld(world, MATCH_DURATION_MS);
    const [winningEnergy, lateEnergy] = [...world.energy.keys()];
    collectEnergy(world, "red", winningEnergy!);
    const lateScorer = world.players.get("blue")!;
    const winner = world.players.get("red")!;
    winner.shieldUntil = 0;

    expect(collectEnergy(world, "blue", lateEnergy!)).toBe(false);
    expect(damagePlayer(world, "red", "blue", MAX_HEALTH)).toBe(false);
    expect(lateScorer.score).toBe(8);
    expect(winner.health).toBe(MAX_HEALTH);
    expect(world.winnerIds).toEqual(["red"]);
  });

  it("rejects player input after the match is finished", () => {
    const world = createWorld();
    world.players.get("red")!.score = 8;
    world.players.get("blue")!.score = 8;
    stepWorld(world, MATCH_DURATION_MS);
    collectEnergy(world, "red", [...world.energy.keys()][0]!);

    expect(applyPlayerInput(world, "blue", {
      seq: 1,
      moveX: 1,
      moveY: 0,
      aimX: 1,
      aimY: 0,
      firing: false,
    })).toBe(false);
    expect(world.players.get("blue")!.lastProcessedInput).toBe(0);
  });

  it("ignores a non-leader score during sudden death", () => {
    const world = createGameWorld([
      { id: "red", nickname: "Red", color: "#ff0000", isBot: false },
      { id: "blue", nickname: "Blue", color: "#0000ff", isBot: false },
      { id: "green", nickname: "Green", color: "#00ff00", isBot: false },
    ]);
    world.players.get("red")!.score = 8;
    world.players.get("blue")!.score = 8;
    world.players.get("green")!.score = 7;
    stepWorld(world, MATCH_DURATION_MS);
    const [firstEnergy, secondEnergy] = [...world.energy.keys()];

    collectEnergy(world, "green", firstEnergy!);

    expect(world.phase).toBe("overtime");
    collectEnergy(world, "blue", secondEnergy!);
    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["blue"]);
  });

  it("ends at eight minutes for the unique highest scorer without a completed hold", () => {
    const world = createWorld();
    world.players.get("red")!.score = 12;
    world.players.get("blue")!.score = 10;

    stepWorld(world, MATCH_DURATION_MS);

    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red"]);
    expect(world.finishedAt).toBe(world.now);
  });

  it("does not resolve projectile hits after the eight-minute cutoff", () => {
    const world = createWorld();
    const leader = world.players.get("red")!;
    const attacker = world.players.get("blue")!;
    leader.score = 9;
    leader.x = 500;
    leader.y = 200;
    leader.health = PROJECTILE_DAMAGE;
    leader.shieldUntil = 0;
    attacker.score = 8;
    world.remainingMs = 1;
    world.projectiles.set("after-cutoff", {
      id: "after-cutoff",
      ownerId: "blue",
      x: 450,
      y: 200,
      vx: 1000,
      vy: 0,
      expiresAt: world.now + 1000,
    });

    stepWorld(world, 16);

    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red"]);
    expect(leader.alive).toBe(true);
    expect(attacker.score).toBe(8);
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
    player.x = scaleArenaPosition(945);
    player.y = scaleArenaPosition(500);
    player.shieldUntil = 0;

    stepWorld(world, 16);

    expect(WALLS.some((wall) => circleHitsRect(player, PLAYER_RADIUS, wall))).toBe(false);
  });

  it("separates players without pushing either one into a wall", () => {
    const world = createWorld();
    const left = world.players.get("red")!;
    const right = world.players.get("blue")!;
    left.x = scaleArenaPosition(900);
    left.y = scaleArenaPosition(500);
    right.x = scaleArenaPosition(930);
    right.y = scaleArenaPosition(500);
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
    expect(right.x).toBeLessThanOrEqual(ARENA_WIDTH - PLAYER_RADIUS);
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
    target.x = scaleArenaPosition(1300);
    target.y = scaleArenaPosition(500);
    target.shieldUntil = 0;
    world.projectiles.set("tunneling", {
      id: "tunneling",
      ownerId: "red",
      x: scaleArenaPosition(900),
      y: scaleArenaPosition(500),
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
    target.x = scaleArenaPosition(900);
    target.y = scaleArenaPosition(500);
    target.shieldUntil = 0;
    world.projectiles.set("player-first", {
      id: "player-first",
      ownerId: "red",
      x: scaleArenaPosition(850),
      y: scaleArenaPosition(500),
      vx: 5000,
      vy: 0,
      expiresAt: world.now + 1000,
    });

    stepWorld(world, 100);

    expect(target.health).toBe(MAX_HEALTH - PROJECTILE_DAMAGE);
    expect(world.projectiles.size).toBe(0);
  });
});
