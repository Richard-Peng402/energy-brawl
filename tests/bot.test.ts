import { describe, expect, it } from "vitest";

import { chooseBotDecision } from "../src/server/bot";
import { createGameWorld } from "../src/server/simulation";

describe("bot decisions", () => {
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

    expect(input.moveX).toBeGreaterThan(0.9);
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

    expect(input.moveX).toBeLessThan(-0.9);
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

    expect(chooseBotDecision(world, bot.id, () => 0.5).useSkill).toBe(true);
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
    expect(chooseBotDecision(world, bot.id, () => 0.5).input.moveX).toBeLessThan(-0.9);

    bot.health = bot.maxHealth;
    enemy.x = bot.x + 1_000;
    world.skillSystem.orbs.get("skill")!.x = bot.x - 160;
    expect(chooseBotDecision(world, bot.id, () => 0.5).input.moveX).toBeLessThan(-0.9);
  });
});
