import { describe, expect, it } from "vitest";

import { CHARACTER_CATALOG, getCharacter, MEDIC_ENERGY_HEAL } from "../src/shared/character-catalog";

describe("character catalog", () => {
  it("defines six unique server-authoritative characters", () => {
    expect(CHARACTER_CATALOG.map((character) => character.id)).toEqual([
      "blaze", "medic", "fortress", "arc", "phase", "runner",
    ]);
    expect(new Set(CHARACTER_CATALOG.map((character) => character.color)).size).toBe(6);
  });

  it("locks the approved v3 balance values", () => {
    expect(getCharacter("blaze")).toMatchObject({ maxHealth: 94, damage: 27 });
    expect(getCharacter("medic")).toMatchObject({ damage: 23 });
    expect(MEDIC_ENERGY_HEAL).toBe(12);
    expect(getCharacter("fortress")).toMatchObject({ maxHealth: 112, moveSpeed: 252 });
    expect(getCharacter("arc")).toMatchObject({ damage: 23, fireCooldownMs: 415 });
    expect(getCharacter("phase")).toMatchObject({ projectileSpeed: 700, fireCooldownMs: 490 });
    expect(getCharacter("runner")).toMatchObject({ maxHealth: 92, moveSpeed: 282 });
  });
});
