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
  SKILL_ORB_SPAWN_MIN_MS,
  SPAWN_SHIELD_MS,
  TARGET_SCORE,
  WALLS,
} from "../src/shared/constants";
import { circleHitsCircle, circleHitsRect } from "../src/shared/math";
import { getCharacter } from "../src/shared/character-catalog";
import {
  applyPlayerInput,
  applyWorldSkillAction,
  collectEnergy,
  collectWorldSkillOrb,
  createGameWorld,
  damagePlayer,
  stepWorld,
  worldToSnapshot,
} from "../src/server/simulation";

function createWorld() {
  return createGameWorld([
    { id: "red", nickname: "红方", characterId: "blaze", isBot: false },
    { id: "blue", nickname: "蓝方", characterId: "fortress", isBot: false },
  ]);
}

const scaleArenaPosition = (value: number) => value * ARENA_SCALE;

describe("authoritative simulation", () => {
  it("applies host lobby stat presets when creating a match", () => {
    const world = createGameWorld([
      {
        id: "preset-player",
        nickname: "预设玩家",
        characterId: "blaze",
        isBot: false,
        stats: {
          health: 180,
          maxHealth: 150,
          damage: 80,
          score: 9,
          moveSpeed: 400,
          fireCooldownMs: 180,
        },
      },
    ]);

    expect(world.players.get("preset-player")).toMatchObject({
      health: 180,
      maxHealth: 180,
      damage: 80,
      score: 9,
      moveSpeed: 400,
      fireCooldownMs: 180,
    });
  });

  it("starts each match with two visible skill orbs", () => {
    const world = createWorld();

    expect(world.skillSystem.orbs.size).toBe(2);
  });

  it("awards two points for a defeat and respawns the victim", () => {
    const world = createWorld();
    stepWorld(world, SPAWN_SHIELD_MS + 1);

    damagePlayer(world, "blue", "red", world.players.get("blue")!.maxHealth);

    expect(world.players.get("red")?.score).toBe(2);
    expect(world.players.get("red")?.kills).toBe(1);
    expect(world.players.get("blue")?.alive).toBe(false);

    stepWorld(world, RESPAWN_DELAY_MS + 1);

    expect(world.players.get("blue")?.alive).toBe(true);
    expect(world.players.get("blue")?.health).toBe(getCharacter("fortress").maxHealth);
  });

  it("uses each character's dynamic movement, firing, projectile and respawn stats", () => {
    const world = createWorld();
    const attacker = world.players.get("red")!;
    const victim = world.players.get("blue")!;
    attacker.moveSpeed = 310;
    attacker.fireCooldownMs = 777;
    attacker.projectileSpeed = 888;
    attacker.damage = 19;
    attacker.shieldUntil = 0;
    victim.shieldUntil = 0;
    victim.x = attacker.x + 500;
    victim.y = attacker.y;

    applyPlayerInput(world, attacker.id, { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: true });
    stepWorld(world, 1);

    expect(attacker.vx).toBe(310);
    expect(attacker.nextFireAt).toBe(world.now + 777);
    const projectile = [...world.projectiles.values()][0]!;
    expect(projectile.vx).toBe(888);

    victim.x = projectile.x + 50;
    victim.y = projectile.y;
    applyPlayerInput(world, attacker.id, { seq: 2, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: false });
    stepWorld(world, 100);
    expect(victim.health).toBe(victim.maxHealth - 19);

    damagePlayer(world, victim.id, attacker.id, victim.health);
    victim.maxHealth = 137;
    stepWorld(world, RESPAWN_DELAY_MS + 1);
    expect(victim.health).toBe(137);
  });

  it("heals medics by twelve on energy pickup without exceeding max health", () => {
    const world = createGameWorld([
      { id: "medic", nickname: "医师", characterId: "medic", isBot: false },
    ]);
    const medic = world.players.get("medic")!;
    medic.health = medic.maxHealth - 5;

    collectEnergy(world, medic.id, [...world.energy.keys()][0]!);

    expect(medic.health).toBe(medic.maxHealth);
  });

  it("regenerates eight health per second only after five seconds out of combat", () => {
    const world = createWorld();
    stepWorld(world, SPAWN_SHIELD_MS + 1);
    const attacker = world.players.get("red")!;
    const victim = world.players.get("blue")!;
    attacker.health -= 20;

    damagePlayer(world, victim.id, attacker.id, 40);
    const attackerAfterCombat = attacker.health;
    const victimAfterCombat = victim.health;
    stepWorld(world, 4_999);
    expect(attacker.health).toBe(attackerAfterCombat);
    expect(victim.health).toBe(victimAfterCombat);

    stepWorld(world, 1);
    expect(victim.health).toBe(victimAfterCombat);
    stepWorld(world, 1_000);
    expect(attacker.health).toBe(attackerAfterCombat + 8);
    expect(victim.health).toBe(victimAfterCombat + 8);

    damagePlayer(world, victim.id, attacker.id, 1);
    const resetHealth = victim.health;
    stepWorld(world, 4_999);
    expect(victim.health).toBe(resetHealth);
  });


  it("replaces a held skill without scoring and clears the slot on death", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.score = 7;
    player.skillSlot = { type: "shield", charges: 1 };
    stepWorld(world, SKILL_ORB_SPAWN_MIN_MS);
    const orb = [...world.skillSystem.orbs.values()][0]!;

    expect(collectWorldSkillOrb(world, player.id, orb.id)).toBe(true);
    expect(player.skillSlot).toEqual({ type: orb.type, charges: 1 });
    expect(player.score).toBe(7);
    player.shieldUntil = 0;
    damagePlayer(world, player.id, "blue", player.health);

    expect(player.skillSlot).toEqual({ type: null, charges: 0 });
    expect(worldToSnapshot(world)).toEqual(expect.objectContaining({
      skillOrbs: expect.any(Array),
      players: expect.arrayContaining([expect.objectContaining({ lastProcessedSkillAction: 0 })]),
    }));
  });

  it("dashes about 260 units using movement before aim and keeps the charge without direction", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    const enemy = world.players.get("blue")!;
    player.x = 300;
    player.y = 800;
    enemy.x = 1_500;
    enemy.y = 1_200;
    player.input = { seq: 1, moveX: 1, moveY: 0, aimX: 0, aimY: 1, firing: false };
    player.skillSlot = { type: "dash", charges: 1 };

    expect(applyWorldSkillAction(world, player.id, 1)).toBe(true);
    expect(player.x).toBeCloseTo(560, 4);
    expect(player.y).toBeCloseTo(800, 4);
    expect(player.skillSlot.charges).toBe(0);

    player.input = { ...player.input, moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
    player.skillSlot = { type: "dash", charges: 1 };
    expect(applyWorldSkillAction(world, player.id, 2)).toBe(true);
    expect(player.skillSlot).toEqual({ type: "dash", charges: 1 });
  });

  it("stops dash continuously at players, walls, and arena bounds", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    const enemy = world.players.get("blue")!;
    player.x = 300;
    player.y = 300;
    enemy.x = 450;
    enemy.y = 300;
    player.input = { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false };
    player.skillSlot = { type: "dash", charges: 1 };
    applyWorldSkillAction(world, player.id, 1);
    expect(player.x).toBeLessThan(enemy.x - PLAYER_RADIUS * 2);

    player.x = ARENA_WIDTH - 100;
    player.y = 300;
    enemy.x = 300;
    enemy.y = 1_300;
    player.skillSlot = { type: "dash", charges: 1 };
    applyWorldSkillAction(world, player.id, 2);
    expect(player.x).toBe(ARENA_WIDTH - PLAYER_RADIUS);
  });

  it("absorbs fifty damage with a five-second shield before health", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.shieldUntil = 0;
    player.skillSlot = { type: "shield", charges: 1 };
    applyWorldSkillAction(world, player.id, 1);

    damagePlayer(world, player.id, "blue", 30);
    expect(player.health).toBe(player.maxHealth);
    expect(player.skillShieldHealth).toBe(20);
    damagePlayer(world, player.id, "blue", 25);
    expect(player.health).toBe(player.maxHealth - 5);
    expect(player.skillShieldHealth).toBe(0);

    player.skillSlot = { type: "shield", charges: 1 };
    applyWorldSkillAction(world, player.id, 2);
    world.now += 5_001;
    damagePlayer(world, player.id, "blue", 10);
    expect(player.health).toBe(player.maxHealth - 15);
    expect(player.skillShieldHealth).toBe(0);
  });

  it("fires three wall-safe spread projectiles at minus twelve, zero, and plus twelve degrees", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.input = { seq: 1, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: false };
    player.skillSlot = { type: "spread", charges: 1 };
    applyWorldSkillAction(world, player.id, 1);

    const projectiles = [...world.projectiles.values()].sort((left, right) => left.vy - right.vy);
    expect(projectiles).toHaveLength(3);
    expect(projectiles.map((projectile) => Math.atan2(projectile.vy, projectile.vx) * 180 / Math.PI)).toEqual([
      expect.closeTo(-12, 4),
      expect.closeTo(0, 4),
      expect.closeTo(12, 4),
    ]);
    expect(projectiles.every((projectile) => projectile.damage === 18)).toBe(true);
  });

  it("applies eighteen spread damage to a player before a later obstacle but never through a nearer wall", () => {
    const openWorld = createWorld();
    const shooter = openWorld.players.get("red")!;
    const target = openWorld.players.get("blue")!;
    shooter.x = 300;
    shooter.y = 800;
    target.x = 700;
    target.y = 800;
    target.shieldUntil = 0;
    shooter.input = { seq: 1, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: false };
    shooter.skillSlot = { type: "spread", charges: 1 };
    applyWorldSkillAction(openWorld, shooter.id, 1);
    stepWorld(openWorld, 700);
    expect(target.health).toBe(target.maxHealth - 18);

    const blockedWorld = createWorld();
    const blockedShooter = blockedWorld.players.get("red")!;
    const blockedTarget = blockedWorld.players.get("blue")!;
    blockedShooter.x = 1_100;
    blockedShooter.y = 650;
    blockedTarget.x = 1_800;
    blockedTarget.y = 650;
    blockedTarget.shieldUntil = 0;
    blockedShooter.input = { seq: 1, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: false };
    blockedShooter.skillSlot = { type: "spread", charges: 1 };
    applyWorldSkillAction(blockedWorld, blockedShooter.id, 1);
    stepWorld(blockedWorld, 1_200);
    expect(blockedTarget.health).toBe(blockedTarget.maxHealth);
  });

  it("heals thirty-five without exceeding max health and keeps the charge at full health", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.health = player.maxHealth - 20;
    player.skillSlot = { type: "heal", charges: 1 };
    applyWorldSkillAction(world, player.id, 1);
    expect(player.health).toBe(player.maxHealth);
    expect(player.skillSlot.charges).toBe(0);

    player.skillSlot = { type: "heal", charges: 1 };
    applyWorldSkillAction(world, player.id, 2);
    expect(player.skillSlot).toEqual({ type: "heal", charges: 1 });
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
    expect(winner.health).toBe(winner.maxHealth);
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
      { id: "red", nickname: "Red", characterId: "blaze", isBot: false },
      { id: "blue", nickname: "Blue", characterId: "fortress", isBot: false },
      { id: "green", nickname: "Green", characterId: "medic", isBot: false },
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
      characterId: "blaze",
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

    expect(target.health).toBe(target.maxHealth);
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

    expect(target.health).toBe(target.maxHealth - world.players.get("red")!.damage);
    expect(world.projectiles.size).toBe(0);
  });
});
