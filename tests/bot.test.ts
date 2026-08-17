import { describe, expect, it } from "vitest";

import { chooseBotDecision, selectCombatTarget } from "../src/server/bot";
import { advanceMapMechanicState } from "../src/server/map-mechanic-system";
import { createGameWorld } from "../src/server/simulation";

describe("bot decisions", () => {
  it("changes behavior difficulty without changing character stats", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "bot", characterId: "medic", isBot: true },
      { id: "enemy", nickname: "enemy", characterId: "blaze", isBot: false },
    ]);
    const bot = world.players.get("bot-1")!;
    const enemy = world.players.get("enemy")!;
    enemy.x = bot.x + 200;
    enemy.y = bot.y;
    const before = { health: bot.maxHealth, damage: bot.damage, moveSpeed: bot.moveSpeed };

    const easy = chooseBotDecision(world, bot.id, () => 1, "easy");
    const hard = chooseBotDecision(world, bot.id, () => 1, "hard");

    expect(easy.aimErrorRadians).toBeGreaterThan(hard.aimErrorRadians);
    expect(Math.abs(Math.atan2(easy.input.aimY, easy.input.aimX))).toBeGreaterThan(
      Math.abs(Math.atan2(hard.input.aimY, hard.input.aimX)),
    );
    expect({ health: bot.maxHealth, damage: bot.damage, moveSpeed: bot.moveSpeed }).toEqual(before);
  });

  it("never selects a teammate as its combat target in team modes", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "bot", characterId: "medic", isBot: true, teamId: "red" },
      { id: "ally", nickname: "ally", characterId: "blaze", isBot: false, teamId: "red" },
      { id: "enemy", nickname: "enemy", characterId: "fortress", isBot: false, teamId: "blue" },
    ], 0, "team3v3");
    const bot = world.players.get("bot-1")!;
    const ally = world.players.get("ally")!;
    const enemy = world.players.get("enemy")!;
    ally.x = bot.x + 80;
    ally.y = bot.y;
    enemy.x = bot.x + 220;
    enemy.y = bot.y;

    expect(selectCombatTarget(world, bot)?.id).toBe("enemy");
    const decision = chooseBotDecision(world, bot.id, () => 0.5);

    expect(decision.input.firing).toBe(true);
    expect(decision.input.aimX).toBeGreaterThan(0);
    expect(decision.input.aimY).toBeCloseTo(0, 4);
  });

  it("prioritizes the central objective in team modes when not retreating", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "bot", characterId: "medic", isBot: true, teamId: "red" },
      { id: "human", nickname: "human", characterId: "blaze", isBot: false, teamId: "blue" },
    ], 0, "team3v3");
    const bot = world.players.get("bot-1")!;
    const enemy = world.players.get("human")!;
    enemy.x = bot.x + 1_000;
    enemy.y = bot.y;
    world.energy.clear();
    const decision = chooseBotDecision(world, bot.id, () => 0.5);
    expect(decision.input.moveX).toBeGreaterThan(0);
    expect(Math.abs(decision.input.moveY)).toBeLessThan(0.75);
  });

  it("moves toward nearby energy when no enemy is urgent", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "脉冲", characterId: "medic", isBot: true },
      { id: "human", nickname: "玩家", characterId: "blaze", isBot: false },
    ]);
    const bot = world.players.get("bot-1")!;
    world.players.get("human")!.x = 1_400;
    world.players.get("human")!.y = 800;
    world.energy.clear();
    world.energy.set("nearby", { id: "nearby", x: bot.x + 100, y: bot.y });

    const { input } = chooseBotDecision(world, "bot-1", () => 0.5);

    expect(Math.hypot(input.moveX, input.moveY)).toBeCloseTo(0.75, 4);
    expect(Math.abs(input.moveY)).toBeLessThan(0.1);
  });

  it("retreats from a nearby enemy at low health", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "脉冲", characterId: "medic", isBot: true },
      { id: "human", nickname: "玩家", characterId: "blaze", isBot: false },
    ]);
    const bot = world.players.get("bot-1")!;
    const enemy = world.players.get("human")!;
    bot.health = 20;
    enemy.x = bot.x + 100;
    enemy.y = bot.y;

    const { input } = chooseBotDecision(world, "bot-1", () => 0.5);

    expect(input.moveX).toBeCloseTo(-0.75, 4);
    expect(input.firing).toBe(true);
  });

  it.each([
    { skill: "heal" as const, health: 20, enemyDistance: 700 },
    { skill: "shield" as const, health: 60, enemyDistance: 180 },
    { skill: "spread" as const, health: 90, enemyDistance: 260 },
    { skill: "dash" as const, health: 90, enemyDistance: 700 },
  ])("uses $skill in its tactical window", ({ skill, health, enemyDistance }) => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "脉冲", characterId: "medic", isBot: true },
      { id: "human", nickname: "玩家", characterId: "blaze", isBot: false },
    ]);
    const bot = world.players.get("bot-1")!;
    const enemy = world.players.get("human")!;
    bot.health = health;
    bot.skillSlot = { type: skill, charges: 1 };
    enemy.x = bot.x + enemyDistance;
    enemy.y = bot.y;

    const randomValues = [0.5, 0.1];
    expect(chooseBotDecision(world, bot.id, () => randomValues.shift() ?? 0.5).useSkill).toBe(true);
  });

  it("hesitates on skills, stops firing beyond 420 units, and has wider aim error", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "脉冲", characterId: "medic", isBot: true },
      { id: "human", nickname: "玩家", characterId: "blaze", isBot: false },
    ]);
    const bot = world.players.get("bot-1")!;
    const enemy = world.players.get("human")!;
    bot.skillSlot = { type: "spread", charges: 1 };
    enemy.x = bot.x + 450;
    enemy.y = bot.y;

    const randomValues = [1, 1];
    const decision = chooseBotDecision(world, bot.id, () => randomValues.shift() ?? 1);

    expect(decision.input.firing).toBe(false);
    expect(Math.atan2(decision.input.aimY, decision.input.aimX)).toBeCloseTo(0.45, 4);
    expect(decision.useSkill).toBe(false);
  });

  it("prioritizes escape over skill orbs and skill orbs over ordinary energy", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "脉冲", characterId: "medic", isBot: true },
      { id: "human", nickname: "玩家", characterId: "blaze", isBot: false },
    ]);
    const bot = world.players.get("bot-1")!;
    const enemy = world.players.get("human")!;
    enemy.x = bot.x + 100;
    enemy.y = bot.y;
    world.skillSystem.orbs.set("skill", { id: "skill", type: "dash", x: bot.x + 160, y: bot.y });
    world.energy.clear();
    world.energy.set("energy", { id: "energy", x: bot.x + 60, y: bot.y });
    bot.health = 20;
    expect(chooseBotDecision(world, bot.id, () => 0.5).input.moveX).toBeCloseTo(-0.75, 4);

    bot.health = bot.maxHealth;
    enemy.x = bot.x + 1_000;
    world.skillSystem.orbs.get("skill")!.x = bot.x - 160;
    expect(chooseBotDecision(world, bot.id, () => 0.5).input.moveX).toBeCloseTo(-0.75, 4);
  });

  it("escapes reactor warning before pursuing enemies, pickups or objectives", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "bot", characterId: "medic", isBot: true, teamId: "red" },
      { id: "enemy", nickname: "enemy", characterId: "blaze", isBot: false, teamId: "blue" },
    ], 0, "team3v3", "reactor-core", { mapMechanicsEnabled: true });
    const bot = world.players.get("bot-1")!;
    bot.x = 1_540;
    bot.y = 810;
    world.players.get("enemy")!.x = 1_400;
    world.players.get("enemy")!.y = 810;
    world.energy.set("bait", { id: "bait", x: 1_400, y: 810 });
    world.skillSystem.orbs.set("skill", { id: "skill", type: "dash", x: 1_420, y: 810 });
    advanceMapMechanicState(world.mapMechanicState!, 20_000, true);

    const decision = chooseBotDecision(world, bot.id, () => 0.5);

    expect(decision.input.moveX).toBeGreaterThan(0.7);
    expect(Math.abs(decision.input.moveY)).toBeLessThan(0.05);
  });

  it("keeps moving outward through the reactor boundary hysteresis band", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "bot", characterId: "medic", isBot: true },
    ], 0, "solo", "reactor-core", { mapMechanicsEnabled: true });
    const bot = world.players.get("bot-1")!;
    advanceMapMechanicState(world.mapMechanicState!, 20_000, true);
    bot.y = 810;

    bot.x = 1_440 + 294;
    const inside = chooseBotDecision(world, bot.id, () => 0.5).input.moveX;
    bot.x = 1_440 + 326;
    const edge = chooseBotDecision(world, bot.id, () => 0.5).input.moveX;

    expect(inside).toBeGreaterThan(0.7);
    expect(edge).toBeGreaterThan(0.7);
  });

  it("uses an active neon lane when it is a short route toward the target", () => {
    const world = createGameWorld([
      { id: "bot-1", nickname: "bot", characterId: "medic", isBot: true },
      { id: "enemy", nickname: "enemy", characterId: "blaze", isBot: false },
    ], 0, "solo", "neon-docks", { mapMechanicsEnabled: true });
    const bot = world.players.get("bot-1")!;
    bot.x = 800;
    bot.y = 800;
    world.players.get("enemy")!.x = 2_200;
    world.players.get("enemy")!.y = 800;
    world.energy.clear();
    world.skillSystem.orbs.clear();
    advanceMapMechanicState(world.mapMechanicState!, 24_000, true);

    const decision = chooseBotDecision(world, bot.id, () => 0.5);

    expect(decision.input.moveX).toBeGreaterThan(0.55);
    expect(decision.input.moveY).toBeLessThan(-0.15);
  });

  it("pursues safe crystal resonance when wounded and retreats when outnumbered", () => {
    const safe = createGameWorld([
      { id: "bot", nickname: "bot", characterId: "medic", isBot: true, teamId: "red" },
      { id: "enemy", nickname: "enemy", characterId: "blaze", isBot: false, teamId: "blue" },
    ], 0, "team3v3", "crystal-ruins", { mapMechanicsEnabled: true });
    const safeBot = safe.players.get("bot")!;
    safeBot.health = safeBot.maxHealth * 0.6;
    safeBot.x = 850;
    safeBot.y = 450;
    safe.players.get("enemy")!.x = 2_400;
    safe.players.get("enemy")!.y = 1_300;
    safe.energy.clear();
    safe.skillSystem.orbs.clear();
    advanceMapMechanicState(safe.mapMechanicState!, 24_000, true);
    expect(chooseBotDecision(safe, safeBot.id, () => 0.5).input.moveX).toBeGreaterThan(0.7);

    const contested = createGameWorld([
      { id: "bot", nickname: "bot", characterId: "medic", isBot: true, teamId: "red" },
      { id: "enemy-1", nickname: "enemy", characterId: "blaze", isBot: false, teamId: "blue" },
      { id: "enemy-2", nickname: "enemy", characterId: "arc", isBot: false, teamId: "blue" },
    ], 0, "team3v3", "crystal-ruins", { mapMechanicsEnabled: true });
    const contestedBot = contested.players.get("bot")!;
    contestedBot.health = contestedBot.maxHealth * 0.6;
    contestedBot.x = 1_160;
    contestedBot.y = 450;
    contested.players.get("enemy-1")!.x = 1_080;
    contested.players.get("enemy-1")!.y = 420;
    contested.players.get("enemy-2")!.x = 1_090;
    contested.players.get("enemy-2")!.y = 480;
    contested.energy.clear();
    contested.skillSystem.orbs.clear();
    advanceMapMechanicState(contested.mapMechanicState!, 24_000, true);

    expect(chooseBotDecision(contested, contestedBot.id, () => 0.5).input.moveX).toBeGreaterThan(0.7);
  });

  it("leaves an active lockdown zone before pursuing combat", () => {
    const world = createGameWorld([
      { id: "bot", nickname: "bot", characterId: "medic", isBot: true },
    ], 0, "solo", "reactor-core", { mapEventsEnabled: true });
    const state = world.mapEventState!;
    state.kind = "area-lockdown";
    state.phase = "active";
    state.zone = { kind: "rect", x: 1_000, y: 600, width: 600, height: 200 };
    state.point = null;
    const bot = world.players.get("bot")!;
    bot.x = 1_020;
    bot.y = 700;
    const decision = chooseBotDecision(world, bot.id, () => 0.5);
    expect(decision.input.moveX).toBeLessThan(0);
  });

  it("routes toward an active storm safe zone when outside it", () => {
    const world = createGameWorld([
      { id: "bot", nickname: "bot", characterId: "medic", isBot: true },
    ], 0, "solo", "reactor-core", { mapEventsEnabled: true });
    const state = world.mapEventState!;
    state.kind = "energy-storm";
    state.phase = "active";
    state.zone = { kind: "circle", x: 700, y: 810, radius: 220 };
    state.point = null;
    const bot = world.players.get("bot")!;
    bot.x = 1_400;
    bot.y = 810;
    const decision = chooseBotDecision(world, bot.id, () => 0.5);
    expect(decision.input.moveX).toBeLessThan(-0.5);
  });

  it("contests a safe supply drop when no better combat objective exists", () => {
    const world = createGameWorld([
      { id: "bot", nickname: "bot", characterId: "medic", isBot: true },
    ], 0, "solo", "reactor-core", { mapEventsEnabled: true });
    const state = world.mapEventState!;
    state.kind = "supply-drop";
    state.phase = "active";
    state.zone = null;
    state.point = { x: 1_500, y: 810 };
    const bot = world.players.get("bot")!;
    bot.x = 1_200;
    bot.y = 810;
    const decision = chooseBotDecision(world, bot.id, () => 0.5);
    expect(decision.input.moveX).toBeGreaterThan(0.5);
  });

  it("pauses briefly during a scan after making recent activity", () => {
    const world = createGameWorld([
      { id: "bot", nickname: "bot", characterId: "medic", isBot: true },
    ], 0, "solo", "reactor-core", { mapEventsEnabled: true });
    const state = world.mapEventState!;
    state.kind = "global-scan";
    state.phase = "active";
    state.zone = null;
    state.point = null;
    const bot = world.players.get("bot")!;
    bot.lastMapEventActivityAt = world.now - 100;
    const decision = chooseBotDecision(world, bot.id, () => 0.5);
    expect(decision.input.moveX).toBe(0);
    expect(decision.input.moveY).toBe(0);
    expect(decision.input.firing).toBe(false);
  });
});
