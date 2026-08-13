import { describe, expect, it } from "vitest";

import { CHARACTER_CATALOG, getCharacter, MEDIC_ENERGY_HEAL } from "../src/shared/character-catalog";

describe("character catalog", () => {
  it("defines six unique server-authoritative characters", () => {
    expect(CHARACTER_CATALOG.map((character) => character.id)).toEqual([
      "blaze", "medic", "fortress", "arc", "phase", "runner",
    ]);
    expect(new Set(CHARACTER_CATALOG.map((character) => character.color)).size).toBe(6);
  });

  it("locks the approved v4.5 balance values", () => {
    expect(getCharacter("blaze")).toMatchObject({ maxHealth: 104, damage: 24, fireCooldownMs: 600, moveSpeed: 272, projectileSpeed: 660 });
    expect(getCharacter("medic")).toMatchObject({ maxHealth: 108, damage: 18, fireCooldownMs: 560, moveSpeed: 255, projectileSpeed: 620 });
    expect(MEDIC_ENERGY_HEAL).toBe(12);
    expect(getCharacter("fortress")).toMatchObject({ maxHealth: 136, damage: 20, fireCooldownMs: 650, moveSpeed: 225, projectileSpeed: 570 });
    expect(getCharacter("arc")).toMatchObject({ maxHealth: 96, damage: 14, fireCooldownMs: 360, moveSpeed: 258, projectileSpeed: 680 });
    expect(getCharacter("phase")).toMatchObject({ maxHealth: 88, damage: 30, fireCooldownMs: 900, moveSpeed: 248, projectileSpeed: 880 });
    expect(getCharacter("runner")).toMatchObject({ maxHealth: 92, damage: 18, fireCooldownMs: 500, moveSpeed: 310, projectileSpeed: 650 });
  });
});
