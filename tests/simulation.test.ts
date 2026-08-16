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
  applyWorldExclusiveSkill,
  applyWorldSkillAction,
  collectEnergy,
  collectWorldSkillOrb,
  createGameWorld,
  damagePlayer,
  finishWorldMatch,
  refreshWorldScoreState,
  stepWorld,
  worldToSnapshot,
} from "../src/server/simulation";
import { PROJECTILE_MAX_DISTANCE } from "../src/shared/constants";
import { DEFAULT_CAPTURE_POINT_CONFIG } from "../src/shared/capture-point";
import { getMapDefinition } from "../src/shared/map-catalog";

function createWorld() {
  return createGameWorld([
    { id: "red", nickname: "红方", characterId: "blaze", isBot: false },
    { id: "blue", nickname: "蓝方", characterId: "fortress", isBot: false },
  ]);
}

const scaleArenaPosition = (value: number) => value * ARENA_SCALE;

describe("reactor venting", () => {
  const reactorWorld = () => createGameWorld([
    { id: "p1", nickname: "相位", characterId: "phase", isBot: false },
    { id: "p2", nickname: "烈锋", characterId: "blaze", isBot: false },
  ], 0, "solo", "reactor-core", { mapMechanicsEnabled: true });

  it("warns without damage and applies exactly one tick after one active second", () => {
    const world = reactorWorld();
    const target = world.players.get("p1")!;
    const outside = world.players.get("p2")!;
    target.x = 1_440; target.y = 810; target.shieldUntil = 0;
    outside.x = 300; outside.y = 300; outside.shieldUntil = 0;

    stepWorld(world, 23_999);
    expect(target.health).toBe(target.maxHealth);
    expect(worldToSnapshot(world).mapMechanic).toMatchObject({ phase: "warning", phaseEndsAt: 24_000 });
    stepWorld(world, 1);
    expect(target.health).toBe(target.maxHealth);
    stepWorld(world, 999);
    expect(target.health).toBe(target.maxHealth);
    stepWorld(world, 1);

    expect(target.health).toBe(target.maxHealth - 8);
    expect(target.lastCombatAt).toBe(world.now);
    expect(outside.health).toBe(outside.maxHealth);
    expect(outside.score).toBe(0);
    expect(world.killFeed).toEqual([]);
    expect(worldToSnapshot(world).mapMechanic).toMatchObject({
      kind: "reactor-vent",
      phase: "active",
      zone: { kind: "circle", x: 1_440, y: 810, radius: 300 },
      phaseStartedAt: 24_000,
      phaseEndsAt: 32_000,
    });
  });

  it("counts one successful warning-zone escape per reactor round", () => {
    const world = reactorWorld();
    const target = world.players.get("p1")!;
    target.x = 1_440; target.y = 810;

    stepWorld(world, 20_001);
    target.x = 300; target.y = 300;
    stepWorld(world, 16);
    target.x = 1_440; target.y = 810;
    stepWorld(world, 16);
    target.x = 300; target.y = 300;
    stepWorld(world, 16);

    expect(target.mapMechanicContribution).toMatchObject({ reactorEscapes: 1 });
  });

  it("does not duplicate ticks and cannot kill the full-health phase sniper in one vent", () => {
    const world = reactorWorld();
    const target = world.players.get("p1")!;
    target.x = 1_440; target.y = 810; target.shieldUntil = 0;

    stepWorld(world, 25_000);
    expect(target.health).toBe(80);
    stepWorld(world, 1);
    expect(target.health).toBe(80);
    stepWorld(world, 999);
    expect(target.health).toBe(72);

    const fullVent = reactorWorld();
    const sniper = fullVent.players.get("p1")!;
    sniper.x = 1_440; sniper.y = 810; sniper.shieldUntil = 0;
    stepWorld(fullVent, 32_000);
    expect(sniper.maxHealth).toBe(88);
    expect(sniper.health).toBe(24);
    expect(sniper.alive).toBe(true);
  });

  it("respects spawn shields and never attributes environment deaths", () => {
    const shieldedWorld = reactorWorld();
    const shielded = shieldedWorld.players.get("p1")!;
    shielded.x = 1_440; shielded.y = 810; shielded.shieldUntil = 30_000;
    stepWorld(shieldedWorld, 25_000);
    expect(shielded.health).toBe(shielded.maxHealth);
    shielded.shieldUntil = 0;
    stepWorld(shieldedWorld, 1_000);
    expect(shielded.health).toBe(shielded.maxHealth - 8);

    const lethalWorld = reactorWorld();
    const victim = lethalWorld.players.get("p1")!;
    const opponent = lethalWorld.players.get("p2")!;
    victim.x = 1_440; victim.y = 810; victim.shieldUntil = 0; victim.health = 8;
    victim.recentDamageSources.set(opponent.id, 19_000);
    victim.lastDamageSourceId = opponent.id;
    stepWorld(lethalWorld, 25_000);
    expect(victim.alive).toBe(false);
    expect(victim.recentDamageSources.size).toBe(0);
    expect(victim.lastDamageSourceId).toBeNull();
    expect(opponent.score).toBe(0);
    expect(opponent.kills).toBe(0);
    expect(lethalWorld.killFeed).toEqual([]);
  });

  it("stops immediately after match finish and supports a disabled state", () => {
    const world = reactorWorld();
    const target = world.players.get("p1")!;
    target.x = 1_440; target.y = 810; target.shieldUntil = 0;
    stepWorld(world, 25_000);
    finishWorldMatch(world, ["p2"]);
    const healthAtFinish = target.health;
    stepWorld(world, 20_000);
    expect(target.health).toBe(healthAtFinish);
    expect(worldToSnapshot(world).mapMechanic).toBeNull();

    const disabled = createGameWorld([
      { id: "p1", nickname: "关闭", characterId: "phase", isBot: false },
    ], 0, "solo", "reactor-core", { mapMechanicsEnabled: false });
    expect(disabled.mapMechanicState).toBeNull();
    expect(worldToSnapshot(disabled).mapMechanic).toBeNull();
  });
});

describe("presentation event snapshots", () => {
  it("initializes empty histories and serializes copied event arrays", () => {
    const world = createWorld();
    expect(world.nextExclusiveSkillEventSeq).toBe(1);
    expect(world.nextProjectileImpactEventSeq).toBe(1);
    expect(world.exclusiveSkillEvents).toEqual([]);
    expect(world.projectileImpactEvents).toEqual([]);

    world.exclusiveSkillEvents.push({
      eventSeq: 1,
      serverTime: 10,
      playerId: "red",
      skillId: "breach",
      stage: "cast",
      origin: { x: 10, y: 20 },
      target: { x: 40, y: 20 },
    });
    world.projectileImpactEvents.push({
      eventSeq: 1,
      serverTime: 11,
      projectileId: "projectile-1",
      ownerId: "red",
      targetId: null,
      kind: "wall",
      position: { x: 60, y: 20 },
    });

    const snapshot = worldToSnapshot(world);
    expect(snapshot.exclusiveSkillEvents).toEqual(world.exclusiveSkillEvents);
    expect(snapshot.projectileImpactEvents).toEqual(world.projectileImpactEvents);
    expect(snapshot.exclusiveSkillEvents).not.toBe(world.exclusiveSkillEvents);
    expect(snapshot.projectileImpactEvents).not.toBe(world.projectileImpactEvents);
  });
});

describe("exclusive skill presentation lifecycle", () => {
  it("publishes cast and active events for an accepted exclusive skill", () => {
    const world = createWorld();

    expect(applyWorldExclusiveSkill(world, "red", { x: 1, y: 0 })).toBe(true);

    expect(world.exclusiveSkillEvents.map((event) => event.stage)).toEqual(["cast", "active"]);
    expect(world.exclusiveSkillEvents.every((event) => event.skillId === "breach")).toBe(true);
    expect(world.exclusiveSkillEvents.map((event) => event.eventSeq)).toEqual([1, 2]);
  });

  it("publishes one end event when a timed state expires", () => {
    const world = createWorld();
    expect(applyWorldExclusiveSkill(world, "red", { x: 1, y: 0 })).toBe(true);

    stepWorld(world, 5_001);

    expect(world.exclusiveSkillEvents.filter((event) => event.stage === "end")).toEqual([
      expect.objectContaining({ playerId: "red", skillId: "breach", reason: "expired" }),
    ]);
  });

  it("publishes death cleanup without replaying cast", () => {
    const world = createWorld();
    const red = world.players.get("red")!;
    red.shieldUntil = 0;
    expect(applyWorldExclusiveSkill(world, red.id, { x: 1, y: 0 })).toBe(true);

    expect(damagePlayer(world, red.id, "blue", 10_000)).toBe(true);

    expect(world.exclusiveSkillEvents.at(-1)).toMatchObject({
      playerId: "red",
      skillId: "breach",
      stage: "end",
      reason: "death",
    });
    expect(world.exclusiveSkillEvents.filter((event) => event.stage === "cast")).toHaveLength(1);
  });

  it("keeps rejected requests silent", () => {
    const world = createWorld();
    world.players.get("red")!.alive = false;

    expect(applyWorldExclusiveSkill(world, "red", { x: 1, y: 0 })).toBe(false);
    expect(world.exclusiveSkillEvents).toEqual([]);
  });

  it("publishes exactly one return end event after Blaze reaches its anchor", () => {
    const world = createWorld();
    expect(applyWorldExclusiveSkill(world, "red", { x: 1, y: 0 })).toBe(true);
    stepWorld(world, 180);
    expect(applyWorldExclusiveSkill(world, "red", { x: 0, y: 0 })).toBe(true);

    stepWorld(world, 180);
    stepWorld(world, 5_000);

    expect(world.exclusiveSkillEvents.filter((event) => event.stage === "end")).toEqual([
      expect.objectContaining({ playerId: "red", skillId: "breach", reason: "return" }),
    ]);
  });

  it("publishes reset cleanup for active skills when the match finishes", () => {
    const world = createWorld();
    expect(applyWorldExclusiveSkill(world, "blue", { x: 1, y: 0 })).toBe(true);

    finishWorldMatch(world, ["red"]);

    expect(world.exclusiveSkillEvents.at(-1)).toMatchObject({
      playerId: "blue",
      skillId: "mobile-bulwark",
      stage: "end",
      reason: "reset",
    });
    expect(world.players.get("blue")!.exclusiveSkillState).toBeNull();
  });
});

describe("neon overdrive", () => {
  it("combines movement, firing, projectile and suppression multipliers without replacing host stats", () => {
    const world = createGameWorld([
      { id: "arc", nickname: "电弧", characterId: "arc", isBot: false, teamId: "red", stats: { moveSpeed: 300, fireCooldownMs: 500, projectileSpeed: 1_000 } },
      { id: "fortress", nickname: "堡垒", characterId: "fortress", isBot: false, teamId: "blue" },
    ], 0, "team3v3", "neon-docks", { mapMechanicsEnabled: true });
    const arc = world.players.get("arc")!;
    const fortress = world.players.get("fortress")!;
    arc.x = 1_200; arc.y = 660; arc.shieldUntil = 0;
    fortress.x = 1_400; fortress.y = 660; fortress.shieldUntil = 0;

    stepWorld(world, 24_001);
    expect(arc.statusEffects.get("neon-overdrive")).toMatchObject({ expiresAt: 25_001, purifiable: false });
    expect(applyWorldExclusiveSkill(world, arc.id, { x: 1, y: 0 })).toBe(true);
    expect(applyWorldExclusiveSkill(world, fortress.id, { x: 1, y: 0 })).toBe(true);
    arc.input = { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: true };
    arc.nextFireAt = world.now;

    stepWorld(world, 16);

    expect(arc.vx).toBeCloseTo(300 * 1.15 * 1.12);
    expect(arc.nextFireAt - world.now).toBeCloseTo(500 * 0.7 * 0.9 * 1.25);
    const projectile = [...world.projectiles.values()][0]!;
    expect(Math.hypot(projectile.vx, projectile.vy)).toBeCloseTo(1_000 * 1.15);
    expect(arc.statusEffects.get("bulwark-suppression")).toBeDefined();
  });

  it("stacks with Runner speed and keeps exactly one second of grace after leaving", () => {
    const world = createGameWorld([
      { id: "runner", nickname: "疾行", characterId: "runner", isBot: false },
    ], 0, "solo", "neon-docks", { mapMechanicsEnabled: true });
    const runner = world.players.get("runner")!;
    runner.x = 1_200; runner.y = 660; runner.shieldUntil = 0;
    stepWorld(world, 24_001);
    expect(applyWorldExclusiveSkill(world, runner.id, { x: 1, y: 0 })).toBe(true);
    runner.input = { seq: 1, moveX: 1, moveY: 0, aimX: 0, aimY: 1, firing: false };
    stepWorld(world, 16);
    expect(runner.vx).toBeCloseTo(runner.moveSpeed * 1.28 * 1.12);

    runner.x = 300; runner.y = 300;
    runner.input = { ...runner.input, moveX: 0 };
    const expiresAt = runner.statusEffects.get("neon-overdrive")!.expiresAt;
    stepWorld(world, 500);
    expect(runner.statusEffects.has("neon-overdrive")).toBe(true);
    stepWorld(world, expiresAt - world.now);
    expect(runner.statusEffects.has("neon-overdrive")).toBe(false);
  });

  it("records post-mitigation damage and eliminations while the attacker is overdriven", () => {
    const world = createGameWorld([
      { id: "attacker", nickname: "Attacker", characterId: "arc", isBot: false },
      { id: "victim", nickname: "Victim", characterId: "blaze", isBot: false },
    ], 0, "solo", "neon-docks", { mapMechanicsEnabled: true });
    const attacker = world.players.get("attacker")!;
    const victim = world.players.get("victim")!;
    attacker.x = 1_200; attacker.y = 660; attacker.shieldUntil = 0;
    victim.x = 300; victim.y = 300; victim.shieldUntil = 0;
    stepWorld(world, 24_001);

    expect(damagePlayer(world, victim.id, attacker.id, 20)).toBe(true);
    victim.health = 10;
    expect(damagePlayer(world, victim.id, attacker.id, 20)).toBe(true);

    expect(attacker.mapMechanicContribution).toMatchObject({
      neonDamage: 40,
      mechanicEliminations: 1,
    });
  });
});

describe("crystal resonance", () => {
  const crystalWorld = () => createGameWorld([
    { id: "medic", nickname: "医师", characterId: "medic", isBot: false },
    { id: "enemy", nickname: "敌人", characterId: "blaze", isBot: false },
  ], 0, "solo", "crystal-ruins", { mapMechanicsEnabled: true });

  it("requires 1.25 seconds, heals actual health, reduces damage and clears on death", () => {
    const world = crystalWorld();
    const medic = world.players.get("medic")!;
    const enemy = world.players.get("enemy")!;
    medic.x = 1_100; medic.y = 450; medic.shieldUntil = 0;
    enemy.x = 300; enemy.y = 300; enemy.shieldUntil = 0;

    stepWorld(world, 24_000);
    stepWorld(world, 1_249);
    expect(medic.statusEffects.has("crystal-resonance")).toBe(false);
    expect(worldToSnapshot(world).mapMechanic?.participants).toEqual([
      { playerId: "medic", chargeProgress: 0.9992, claimed: false },
    ]);
    stepWorld(world, 1);
    expect(medic.statusEffects.get("crystal-resonance")).toMatchObject({ expiresAt: 31_250, purifiable: false });
    expect(medic.mapMechanicContribution).toMatchObject({ crystalResonances: 1 });

    medic.health = medic.maxHealth - 10;
    medic.healingDone = 0;
    medic.lastCombatAt = world.now;
    stepWorld(world, 1_000);
    expect(medic.health).toBe(medic.maxHealth - 7);
    expect(medic.healingDone).toBe(3);
    expect(medic.mapMechanicContribution).toMatchObject({ mechanicHealing: 3 });

    medic.health = medic.maxHealth - 1;
    medic.lastCombatAt = world.now;
    stepWorld(world, 1_000);
    expect(medic.health).toBe(medic.maxHealth);
    expect(medic.healingDone).toBe(4);
    expect(medic.mapMechanicContribution).toMatchObject({ mechanicHealing: 4 });

    expect(damagePlayer(world, medic.id, enemy.id, 20)).toBe(true);
    expect(medic.health).toBe(medic.maxHealth - 17);
    medic.health = 1;
    expect(damagePlayer(world, medic.id, enemy.id, 20)).toBe(true);
    expect(medic.alive).toBe(false);
    expect(medic.statusEffects.has("crystal-resonance")).toBe(false);
    expect(medic.mapHealingAccumulatorMs).toBe(0);
  });

  it("resets interrupted charge and permits a new claim in the next active round", () => {
    const world = crystalWorld();
    const medic = world.players.get("medic")!;
    medic.x = 1_100; medic.y = 450; medic.shieldUntil = 0;
    stepWorld(world, 24_000);
    stepWorld(world, 500);
    medic.x = 300; medic.y = 300;
    stepWorld(world, 1);
    expect(worldToSnapshot(world).mapMechanic?.participants).toEqual([]);

    medic.x = 1_100; medic.y = 450;
    stepWorld(world, 1_249);
    expect(medic.statusEffects.has("crystal-resonance")).toBe(false);
    stepWorld(world, 1);
    expect(medic.statusEffects.has("crystal-resonance")).toBe(true);

    medic.x = 1_780; medic.y = 450;
    stepWorld(world, 56_000 - world.now);
    expect(worldToSnapshot(world).mapMechanic).toMatchObject({ phase: "active", round: 1, zoneIndex: 1 });
    stepWorld(world, 1_250);
    expect(worldToSnapshot(world).mapMechanic?.participants).toContainEqual({ playerId: "medic", chargeProgress: 1, claimed: true });
    expect(medic.statusEffects.has("crystal-resonance")).toBe(true);
  });
});

describe("authoritative simulation", () => {
  it("uses v4.5 base stats and blocks Phase fire during its exit lock", () => {
    const world = createGameWorld([
      { id: "phase", nickname: "相位", characterId: "phase", isBot: false },
      { id: "target", nickname: "目标", characterId: "medic", isBot: false },
    ], 0, "solo");
    const phase = world.players.get("phase")!;
    expect(phase).toMatchObject({ maxHealth: 88, damage: 30, fireCooldownMs: 900, moveSpeed: 248, projectileSpeed: 880 });
    phase.shieldUntil = 0;
    expect(applyWorldExclusiveSkill(world, phase.id, { x: 1, y: 0 })).toBe(true);
    phase.input = { seq: 1, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: true };
    stepWorld(world, 100);
    expect(world.projectiles.size).toBe(0);
    stepWorld(world, 200);
    expect(world.projectiles.size).toBe(1);
  });

  it("applies Fortress protection only to its forward sector", () => {
    const world = createGameWorld([
      { id: "fortress", nickname: "堡垒", characterId: "fortress", isBot: false, teamId: "red" },
      { id: "enemy", nickname: "敌人", characterId: "blaze", isBot: false, teamId: "blue" },
    ], 0, "team3v3");
    const fortress = world.players.get("fortress")!;
    const enemy = world.players.get("enemy")!;
    fortress.shieldUntil = 0;
    enemy.shieldUntil = 0;
    fortress.x = 1_000; fortress.y = 800; fortress.angle = 0;
    enemy.x = 1_100; enemy.y = 800;
    expect(applyWorldExclusiveSkill(world, fortress.id, { x: 1, y: 0 })).toBe(true);
    damagePlayer(world, fortress.id, enemy.id, 20);
    expect(fortress.health).toBe(fortress.maxHealth - 11);
    fortress.health = fortress.maxHealth;
    enemy.x = 900;
    damagePlayer(world, fortress.id, enemy.id, 20);
    expect(fortress.health).toBe(fortress.maxHealth - 20);
  });

  it("applies Fortress ally protection and an authoritative purifiable suppression state", () => {
    const world = createGameWorld([
      { id: "fortress", nickname: "堡垒", characterId: "fortress", isBot: false, teamId: "red" },
      { id: "ally", nickname: "队友", characterId: "medic", isBot: false, teamId: "red" },
      { id: "enemy", nickname: "敌人", characterId: "blaze", isBot: false, teamId: "blue" },
    ], 0, "team3v3");
    const fortress = world.players.get("fortress")!;
    const ally = world.players.get("ally")!;
    const enemy = world.players.get("enemy")!;
    for (const player of world.players.values()) player.shieldUntil = 0;
    fortress.x = 1_000; fortress.y = 800; fortress.angle = 0;
    ally.x = 900; ally.y = 800;
    enemy.x = 1_100; enemy.y = 800;
    expect(applyWorldExclusiveSkill(world, fortress.id, { x: 1, y: 0 })).toBe(true);
    stepWorld(world, 20);
    damagePlayer(world, ally.id, enemy.id, 20);
    expect(ally.health).toBe(ally.maxHealth - 15);
    const snapshot = worldToSnapshot(world);
    expect(snapshot.players.find((player) => player.id === enemy.id)?.combatStates).toContainEqual(expect.objectContaining({ id: "bulwark-suppression" }));
  });

  it("moves Blaze through a swept 180ms dash instead of teleporting", () => {
    const world = createGameWorld([
      { id: "blaze", nickname: "烈锋", characterId: "blaze", isBot: false },
      { id: "enemy", nickname: "敌人", characterId: "medic", isBot: false },
    ], 0, "solo");
    const blaze = world.players.get("blaze")!;
    blaze.x = 300; blaze.y = 300; blaze.shieldUntil = 0;
    expect(applyWorldExclusiveSkill(world, blaze.id, { x: 1, y: 0 })).toBe(true);
    expect(blaze.x).toBe(300);
    stepWorld(world, 90);
    expect(blaze.x).toBeGreaterThan(430);
    expect(blaze.x).toBeLessThan(640);
    stepWorld(world, 90);
    expect(blaze.x).toBeCloseTo(640, 0);
  });

  it("does not heal teammates with Pulse Heal in solo mode", () => {
    const world = createGameWorld([
      { id: "medic", nickname: "医师", characterId: "medic", isBot: false, teamId: null },
      { id: "ally", nickname: "队友", characterId: "blaze", isBot: false, teamId: null },
    ], 0, "solo");
    const medic = world.players.get("medic")!;
    const ally = world.players.get("ally")!;
    medic.shieldUntil = 0; ally.shieldUntil = 0;
    medic.health = 50; ally.health = 40;
    expect(applyWorldExclusiveSkill(world, medic.id, { x: 1, y: 0 })).toBe(true);
    expect(medic.health).toBe(78);
    expect(ally.health).toBe(40);
  });

  it("applies exclusive damage and movement multipliers after host stat overrides", () => {
    const world = createGameWorld([
      { id: "runner", nickname: "疾行", characterId: "runner", isBot: false, stats: { damage: 40, moveSpeed: 400 } },
      { id: "target", nickname: "目标", characterId: "medic", isBot: false },
    ], 0, "solo");
    const runner = world.players.get("runner")!;
    expect(applyWorldExclusiveSkill(world, runner.id, { x: 1, y: 0 })).toBe(true);
    runner.input = { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: true };
    stepWorld(world, 100);
    expect(runner.vx).toBeCloseTo(512, 5);
    expect(world.projectiles.values().next().value?.damage).toBeCloseTo(46, 5);
  });
  it("spawns neon energy outside every wall", () => {
    const world = createGameWorld([
      { id: "player", nickname: "player", characterId: "blaze", isBot: false },
    ], 0, "solo", "neon-docks");
    const map = getMapDefinition("neon-docks");

    expect([...world.energy.values()]).not.toHaveLength(0);
    expect([...world.energy.values()].every((energy) => map.walls.every((wall) => !circleHitsRect(energy, 18, wall)))).toBe(true);
  });

  it("uses a map-specific clear center for domination points", () => {
    const neon = createGameWorld([
      { id: "red", nickname: "red", characterId: "blaze", isBot: false, teamId: "red" },
    ], 0, "domination3v3", "neon-docks");
    const crystal = createGameWorld([
      { id: "red", nickname: "red", characterId: "blaze", isBot: false, teamId: "red" },
    ], 0, "domination3v3", "crystal-ruins");

    expect(neon.capturePointConfig.center).toEqual({ x: 1_440, y: 620 });
    expect(crystal.capturePointConfig.center).toEqual({ x: 1_440, y: 590 });
    expect(worldToSnapshot(neon).capturePoint).toMatchObject({ x: 1_440, y: 620 });
    expect(worldToSnapshot(crystal).capturePoint).toMatchObject({ x: 1_440, y: 590 });
  });

  it.each(["reactor-core", "neon-docks", "crystal-ruins"] as const)("keeps the domination center outside walls on %s", (mapId) => {
    const world = createGameWorld([{ id: "player", nickname: "player", characterId: "blaze", isBot: false, teamId: "red" }], 0, "domination3v3", mapId);
    const map = getMapDefinition(mapId);
    expect(map.walls.every((wall) => !circleHitsRect(world.capturePointConfig.center, world.capturePointConfig.radius * 0.45, wall))).toBe(true);
  });

  it("scores only while the fully captured team remains uncontested", () => {
    const world = createGameWorld([
      { id: "red", nickname: "red", characterId: "blaze", isBot: false, teamId: "red" },
      { id: "blue", nickname: "blue", characterId: "fortress", isBot: false, teamId: "blue" },
    ], 0, "domination3v3", "reactor-core", { mapMechanicsEnabled: false });
    const red = world.players.get("red")!;
    const blue = world.players.get("blue")!;
    red.x = world.capturePointConfig.center.x;
    red.y = world.capturePointConfig.center.y;
    blue.x = 200;
    blue.y = 200;
    stepWorld(world, 70_000);
    expect(world.capturePoint?.state).toBe("owned");
    expect(world.captureScores.get("red")).toBeGreaterThan(0);
    const scoreBeforeContest = world.captureScores.get("red") ?? 0;
    blue.x = red.x;
    blue.y = red.y;
    stepWorld(world, 1_000);
    expect(world.capturePoint?.state).toBe("contested");
    expect(world.captureScores.get("red")).toBe(scoreBeforeContest);
  });

  it("advances and broadcasts the central objective only in team modes", () => {
    const world = createGameWorld([
      { id: "red-1", nickname: "红一", characterId: "blaze", isBot: false, teamId: "red" },
      { id: "blue-1", nickname: "蓝一", characterId: "fortress", isBot: false, teamId: "blue" },
    ], 0, "domination3v3");
    const red = world.players.get("red-1")!;
    const blue = world.players.get("blue-1")!;
    red.x = DEFAULT_CAPTURE_POINT_CONFIG.center.x;
    red.y = DEFAULT_CAPTURE_POINT_CONFIG.center.y;
    blue.x = 200;
    blue.y = 200;
    stepWorld(world, 10_000);
    expect(world.capturePoint?.ownerTeamId).toBe("red");
    expect(world.capturePoint?.progress).toBeGreaterThan(0);
    expect(worldToSnapshot(world).capturePoint).toMatchObject({ ownerTeamId: "red", state: "capturing" });
  });

  it("does not end domination from ordinary kill or energy score", () => {
    const world = createGameWorld([
      { id: "red-1", nickname: "红一", characterId: "blaze", isBot: false, teamId: "red" },
      { id: "blue-1", nickname: "蓝一", characterId: "fortress", isBot: false, teamId: "blue" },
    ], 0, "domination3v3");
    world.teamScores.set("red", 100);
    damagePlayer(world, "blue-1", "red-1", 999);
    expect(world.phase).not.toBe("finished");
    expect(world.captureScores.get("red")).toBe(0);
  });

  it("scales team targets and awards kill points to the killer's team", () => {
    const world = createGameWorld([
      { id: "red-1", nickname: "红一", characterId: "blaze", isBot: false, teamId: "red" },
      { id: "red-2", nickname: "红二", characterId: "medic", isBot: false, teamId: "red" },
      { id: "blue-1", nickname: "蓝一", characterId: "fortress", isBot: false, teamId: "blue" },
    ], 0, "team3v3");
    stepWorld(world, SPAWN_SHIELD_MS + 1);
    expect(damagePlayer(world, "blue-1", "red-1", 999)).toBe(true);
    expect(world.teamScores.get("red")).toBe(KILL_SCORE);
    expect(worldToSnapshot(world).teamScores).toEqual(expect.arrayContaining([
      { teamId: "red", score: KILL_SCORE, targetScore: 60 },
      { teamId: "blue", score: 0, targetScore: 60 },
    ]));
  });

  it("ignores friendly damage and lets friendly projectiles pass through teammates", () => {
    const world = createGameWorld([
      { id: "owner", nickname: "攻击者", characterId: "blaze", isBot: false, teamId: "red" },
      { id: "ally", nickname: "队友", characterId: "medic", isBot: false, teamId: "red" },
      { id: "enemy", nickname: "敌人", characterId: "fortress", isBot: false, teamId: "blue" },
    ]);
    const ally = world.players.get("ally")!;
    const enemy = world.players.get("enemy")!;
    ally.x = 160; ally.y = 100; ally.shieldUntil = 0;
    enemy.x = 300; enemy.y = 100; enemy.shieldUntil = 0;
    const owner = world.players.get("owner")!;
    owner.x = 100; owner.y = 100; owner.shieldUntil = 0;
    expect(damagePlayer(world, "ally", "owner", 20)).toBe(false);
    expect(ally.health).toBe(ally.maxHealth);
    world.projectiles.set("friendly-test", {
      id: "friendly-test", ownerId: "owner", x: 100, y: 100, vx: 10_000, vy: 0,
      distanceTraveled: 0, damage: 20,
    });
    stepWorld(world, 30);
    expect(ally.health).toBe(ally.maxHealth);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
  });

  it("uses team leaders for target holds and awards victory to the whole team", () => {
    const world = createGameWorld([
      { id: "red-1", nickname: "红一", characterId: "blaze", isBot: false, teamId: "red" },
      { id: "red-2", nickname: "红二", characterId: "medic", isBot: false, teamId: "red" },
      { id: "blue-1", nickname: "蓝一", characterId: "fortress", isBot: false, teamId: "blue" },
    ], 0, "team3v3");
    world.teamScores.set("red", 60);
    world.teamScores.set("blue", 59);

    refreshWorldScoreState(world, "red-1");
    expect(world.holderId).toBe("red-1");
    expect(world.holdRemainingMs).toBe(HOLD_DURATION_MS);
    stepWorld(world, HOLD_DURATION_MS);

    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red-1", "red-2"]);
  });

  it("ends team overtime when any member of a tied leading team scores", () => {
    const world = createGameWorld([
      { id: "red-1", nickname: "红一", characterId: "blaze", isBot: false, teamId: "red" },
      { id: "red-2", nickname: "红二", characterId: "medic", isBot: false, teamId: "red" },
      { id: "blue-1", nickname: "蓝一", characterId: "fortress", isBot: false, teamId: "blue" },
    ], 0, "team3v3");
    world.teamScores.set("red", 10);
    world.teamScores.set("blue", 10);
    stepWorld(world, MATCH_DURATION_MS);
    expect(world.phase).toBe("overtime");

    const energyId = world.energy.keys().next().value!;
    expect(collectEnergy(world, "red-2", energyId)).toBe(true);
    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red-1", "red-2"]);
  });

  it("uses twenty points as the final v3 target score", () => {
    expect(TARGET_SCORE).toBe(20);
  });
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
          projectileSpeed: 1_200,
          kills: 7,
          energyCollected: 11,
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
      projectileSpeed: 1_200,
      kills: 7,
      energyCollected: 11,
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
    expect(world.killFeed).toEqual([
      expect.objectContaining({ killerId: "red", victimId: "blue", at: world.now }),
    ]);
    expect(worldToSnapshot(world).killFeed).toEqual(world.killFeed);

    stepWorld(world, RESPAWN_DELAY_MS + 1);

    expect(world.players.get("blue")?.alive).toBe(true);
    expect(world.players.get("blue")?.health).toBe(getCharacter("fortress").maxHealth);
  });

  it("records damage, deaths, and assists from the authoritative hit stream", () => {
    const world = createGameWorld([
      { id: "red", nickname: "红", characterId: "blaze", isBot: false },
      { id: "blue", nickname: "蓝", characterId: "medic", isBot: false },
      { id: "gold", nickname: "金", characterId: "fortress", isBot: false },
    ]);
    stepWorld(world, SPAWN_SHIELD_MS + 1);

    damagePlayer(world, "blue", "red", 25);
    damagePlayer(world, "blue", "gold", world.players.get("blue")!.health);

    expect(world.players.get("red")?.damageDealt).toBe(25);
    expect(world.players.get("gold")?.damageDealt).toBe(83);
    expect(world.players.get("gold")?.kills).toBe(1);
    expect(world.players.get("red")?.assists).toBe(1);
    expect(world.players.get("blue")?.deaths).toBe(1);
    expect(world.players.get("blue")?.damageTaken).toBe(108);
    expect(worldToSnapshot(world).players.find((player) => player.id === "blue")).toMatchObject({
      lastDamageSourceId: "gold",
      lastDamagedAt: world.now,
    });
  });

  it("tracks authoritative killstreaks and resets the streak when the killer dies", () => {
    const world = createWorld();
    stepWorld(world, SPAWN_SHIELD_MS + 1);
    const red = world.players.get("red")!;
    const blue = world.players.get("blue")!;

    for (let streak = 1; streak <= 6; streak += 1) {
      blue.shieldUntil = 0;
      expect(damagePlayer(world, blue.id, red.id, blue.health)).toBe(true);
      expect(world.killFeed.at(-1)).toMatchObject({ killerId: red.id, victimId: blue.id, streak });
      stepWorld(world, RESPAWN_DELAY_MS + 1);
    }

    red.shieldUntil = 0;
    blue.shieldUntil = 0;
    expect(damagePlayer(world, red.id, blue.id, red.health)).toBe(true);
    stepWorld(world, RESPAWN_DELAY_MS + 1);
    red.shieldUntil = 0;
    blue.shieldUntil = 0;
    expect(damagePlayer(world, blue.id, red.id, blue.health)).toBe(true);
    expect(world.killFeed.at(-1)).toMatchObject({ killerId: red.id, victimId: blue.id, streak: 1 });
  });

  it.each(["solo", "team3v3", "team2v2v2"] as const)("preserves personal killstreak events in %s", (mode) => {
    const world = createGameWorld([
      { id: "killer", nickname: "击杀者", characterId: "blaze", isBot: false, teamId: mode === "solo" ? null : "red" },
      { id: "victim", nickname: "目标", characterId: "medic", isBot: false, teamId: mode === "solo" ? null : "blue" },
    ], 0, mode);
    stepWorld(world, SPAWN_SHIELD_MS + 1);
    expect(damagePlayer(world, "victim", "killer", 999)).toBe(true);
    expect(world.killFeed.at(-1)).toMatchObject({ killerId: "killer", victimId: "victim", streak: 1 });
    expect(world.players.get("killer")).toMatchObject({ kills: 1, killStreak: 1 });
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

  it("regenerates ten health per second after three seconds out of combat", () => {
    const world = createWorld();
    stepWorld(world, SPAWN_SHIELD_MS + 1);
    const attacker = world.players.get("red")!;
    const victim = world.players.get("blue")!;
    attacker.health -= 20;

    damagePlayer(world, victim.id, attacker.id, 40);
    const attackerAfterCombat = attacker.health;
    const victimAfterCombat = victim.health;
    stepWorld(world, 2_999);
    expect(attacker.health).toBe(attackerAfterCombat);
    expect(victim.health).toBe(victimAfterCombat);

    stepWorld(world, 1);
    expect(victim.health).toBe(victimAfterCombat);
    stepWorld(world, 1_000);
    expect(attacker.health).toBe(attackerAfterCombat + 10);
    expect(victim.health).toBe(victimAfterCombat + 10);

    damagePlayer(world, victim.id, attacker.id, 1);
    const resetHealth = victim.health;
    stepWorld(world, 2_999);
    expect(victim.health).toBe(resetHealth);
  });

  it("gives every projectile the same travel distance regardless of speed", () => {
    const world = createWorld();
    const attacker = world.players.get("red")!;
    const victim = world.players.get("blue")!;
    attacker.x = 200;
    attacker.y = 100;
    victim.x = 2_600;
    victim.y = 1_300;
    attacker.projectileSpeed = 400;
    applyPlayerInput(world, attacker.id, { seq: 1, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: true });
    stepWorld(world, 1);
    const slow = [...world.projectiles.values()][0]!;
    applyPlayerInput(world, attacker.id, { seq: 2, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: false });
    stepWorld(world, 4_000);
    expect(world.projectiles.has(slow.id)).toBe(false);
    expect(slow.distanceTraveled).toBeCloseTo(PROJECTILE_MAX_DISTANCE, 4);

    attacker.nextFireAt = world.now;
    attacker.projectileSpeed = 1_200;
    applyPlayerInput(world, attacker.id, { seq: 3, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: true });
    stepWorld(world, 1);
    const fast = [...world.projectiles.values()][0]!;
    applyPlayerInput(world, attacker.id, { seq: 4, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: false });
    stepWorld(world, 2_000);
    expect(world.projectiles.has(fast.id)).toBe(false);
    expect(fast.distanceTraveled).toBeCloseTo(PROJECTILE_MAX_DISTANCE, 4);
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
    expect(worldToSnapshot(world)).toMatchObject({
      matchMvpId: "red",
      matchMvpScore: expect.any(Number),
    });
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

    damagePlayer(world, "red", "blue", world.players.get("red")!.health);

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
    expect(worldToSnapshot(world).matchMvpId).toBe("red");
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
      distanceTraveled: 0,
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

    expect(Math.hypot(player.vx, player.vy)).toBeLessThanOrEqual(272.001);
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
      distanceTraveled: 0,
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
      distanceTraveled: 0,
    });

    stepWorld(world, 100);

    expect(target.health).toBe(target.maxHealth - world.players.get("red")!.damage);
    expect(world.projectiles.size).toBe(0);
  });
});
