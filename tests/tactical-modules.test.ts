import { describe, expect, it } from "vitest";

import { CHARACTER_CATALOG } from "../src/shared/character-catalog";
import {
  TACTICAL_MODULES,
  defaultTacticalModuleForCharacter,
  getTacticalModule,
  isTacticalModuleId,
} from "../src/shared/tactical-module-catalog";
import { tacticalRuntimeModifiers } from "../src/server/tactical-modules";

describe("tactical module catalog", () => {
  it("defines four modules with a benefit, tradeoff, and counterplay", () => {
    expect(TACTICAL_MODULES).toHaveLength(4);
    expect(new Set(TACTICAL_MODULES.map((module) => module.id)).size).toBe(4);

    for (const module of TACTICAL_MODULES) {
      expect(module.name.length).toBeGreaterThan(1);
      expect(module.summary.length).toBeGreaterThan(4);
      expect(module.benefit.length).toBeGreaterThan(4);
      expect(module.tradeoff.length).toBeGreaterThan(4);
      expect(module.counterplay.length).toBeGreaterThan(4);
      expect(isTacticalModuleId(module.id)).toBe(true);
      expect(getTacticalModule(module.id)).toBe(module);
    }
  });

  it("assigns a valid deterministic default to every character", () => {
    for (const character of CHARACTER_CATALOG) {
      const first = defaultTacticalModuleForCharacter(character.id);
      expect(isTacticalModuleId(first)).toBe(true);
      expect(defaultTacticalModuleForCharacter(character.id)).toBe(first);
    }
  });

  it("rejects unknown module identifiers", () => {
    expect(isTacticalModuleId("damage-boost")).toBe(false);
    expect(isTacticalModuleId(null)).toBe(false);
  });

  it("accelerates projectiles without increasing damage or fire rate", () => {
    expect(tacticalRuntimeModifiers("ballistic-acceleration")).toMatchObject({
      projectileSpeedMultiplier: 1.18,
      projectileDistanceMultiplier: 0.88,
      projectileRadiusMultiplier: 0.9,
      damageMultiplier: 1,
      fireCooldownMultiplier: 1,
    });
  });

  it("pairs each remaining benefit with its required cost", () => {
    expect(tacticalRuntimeModifiers("shield-reinforcement")).toMatchObject({
      shieldMultiplier: 1.3,
      shieldMoveMultiplier: 0.93,
    });
    expect(tacticalRuntimeModifiers("healing-amplifier")).toMatchObject({
      activeHealingMultiplier: 1.22,
      selfHealingMultiplier: 1.1,
      receivedHealingMultiplier: 1.1,
      regenDelayAddMs: 750,
    });
    expect(tacticalRuntimeModifiers("cooldown-converter")).toMatchObject({
      exclusiveCooldownMultiplier: 0.85,
      exclusivePotencyMultiplier: 0.88,
    });
  });
});
