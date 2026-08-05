import { describe, expect, it } from "vitest";

import { chooseBotInput } from "../src/server/bot";
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

    const input = chooseBotInput(world, "bot-1", () => 0.5);

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

    const input = chooseBotInput(world, "bot-1", () => 0.5);

    expect(input.moveX).toBeLessThan(-0.9);
    expect(input.firing).toBe(true);
  });
});
