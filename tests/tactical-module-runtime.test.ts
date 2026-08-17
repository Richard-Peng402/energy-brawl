import { describe, expect, it } from "vitest";

import { PROJECTILE_MAX_DISTANCE, PROJECTILE_RADIUS } from "../src/shared/constants";
import { getCharacter } from "../src/shared/character-catalog";
import { getExclusiveSkill } from "../src/shared/exclusive-skill-catalog";
import {
  applyPlayerInput,
  applyWorldExclusiveSkill,
  applyWorldSkillAction,
  createGameWorld,
  stepWorld,
} from "../src/server/simulation";

const input = {
  seq: 1,
  moveX: 1,
  moveY: 0,
  aimX: 1,
  aimY: 0,
  firing: true,
};

describe("tactical module runtime", () => {
  it("applies faster but shorter and narrower ordinary projectiles", () => {
    const world = createGameWorld([{ id: "p", nickname: "p", characterId: "blaze", tacticalModuleId: "ballistic-acceleration", isBot: false }]);
    const player = world.players.get("p")!;
    applyPlayerInput(world, "p", input);
    stepWorld(world, 17);

    const projectile = [...world.projectiles.values()][0]!;
    expect(player.projectileSpeed).toBeCloseTo(getCharacter("blaze").projectileSpeed * 1.18);
    expect(projectile.maxDistance).toBeCloseTo(PROJECTILE_MAX_DISTANCE * 0.88);
    expect(projectile.radius).toBeCloseTo(PROJECTILE_RADIUS * 0.9);
    expect(projectile.damage).toBe(getCharacter("blaze").damage);
  });

  it("strengthens skill shields and slows movement only while shielded", () => {
    const world = createGameWorld([{ id: "p", nickname: "p", characterId: "fortress", tacticalModuleId: "shield-reinforcement", isBot: false }]);
    const player = world.players.get("p")!;
    player.skillSlot = { type: "shield", charges: 1 };
    expect(applyWorldSkillAction(world, "p", 1)).toBe(true);
    expect(player.skillShieldHealth).toBe(65);
    applyPlayerInput(world, "p", input);
    stepWorld(world, 17);
    expect(player.vx).toBeCloseTo(player.moveSpeed * 0.93);
  });

  it("uses the lower self-heal multiplier and delays natural regeneration", () => {
    const world = createGameWorld([{ id: "p", nickname: "p", characterId: "medic", tacticalModuleId: "healing-amplifier", isBot: false }]);
    const player = world.players.get("p")!;
    player.health = 50;
    player.skillSlot = { type: "heal", charges: 1 };
    expect(applyWorldSkillAction(world, "p", 1)).toBe(true);
    expect(player.health).toBeCloseTo(88.5);
    player.health = 50;
    player.input = { ...input, firing: false, moveX: 0 };
    stepWorld(world, 3_200);
    expect(player.health).toBe(50);
    stepWorld(world, 600);
    expect(player.health).toBeGreaterThan(50);
  });

  it("combines outgoing and received healing modifiers for teammates", () => {
    const world = createGameWorld([
      { id: "medic", nickname: "medic", characterId: "medic", tacticalModuleId: "healing-amplifier", isBot: false, teamId: "red" },
      { id: "ally", nickname: "ally", characterId: "fortress", tacticalModuleId: "healing-amplifier", isBot: false, teamId: "red" },
    ], 0, "team3v3");
    const medic = world.players.get("medic")!;
    const ally = world.players.get("ally")!;
    medic.x = ally.x;
    medic.y = ally.y;
    ally.health = 50;

    expect(applyWorldExclusiveSkill(world, "medic", { x: 1, y: 0 })).toBe(true);
    expect(ally.health).toBeCloseTo(50 + 34 * 1.22 * 1.1);
  });

  it("shortens exclusive cooldown and exposes reduced potency", () => {
    const world = createGameWorld([{ id: "p", nickname: "p", characterId: "arc", tacticalModuleId: "cooldown-converter", isBot: false }]);
    const player = world.players.get("p")!;
    expect(applyWorldExclusiveSkill(world, "p", { x: 1, y: 0 })).toBe(true);
    expect(player.exclusiveSkillReadyAt).toBe(8_500);
    expect(player.exclusivePotencyMultiplier).toBe(0.88);
    expect(player.exclusiveSkillState!.expiresAt).toBe(getExclusiveSkill("arc").balance.durationMs * 0.88);
  });
});
