import { describe, expect, it } from "vitest";

import { CHARACTER_BALANCE, getCharacterBalance } from "../src/shared/character-balance";

describe("v4.5 character balance", () => {
  it("defines the approved base stats for all six characters", () => {
    expect(CHARACTER_BALANCE.map((character) => character.id)).toEqual([
      "blaze", "medic", "fortress", "arc", "phase", "runner",
    ]);
    expect(getCharacterBalance("blaze")).toMatchObject({ maxHealth: 104, damage: 24, fireCooldownMs: 600, moveSpeed: 272, projectileSpeed: 660 });
    expect(getCharacterBalance("medic")).toMatchObject({ maxHealth: 108, damage: 18, fireCooldownMs: 560, moveSpeed: 255, projectileSpeed: 620 });
    expect(getCharacterBalance("fortress")).toMatchObject({ maxHealth: 136, damage: 20, fireCooldownMs: 650, moveSpeed: 225, projectileSpeed: 570 });
    expect(getCharacterBalance("arc")).toMatchObject({ maxHealth: 96, damage: 14, fireCooldownMs: 360, moveSpeed: 258, projectileSpeed: 680 });
    expect(getCharacterBalance("phase")).toMatchObject({ maxHealth: 88, damage: 30, fireCooldownMs: 900, moveSpeed: 248, projectileSpeed: 880 });
    expect(getCharacterBalance("runner")).toMatchObject({ maxHealth: 92, damage: 18, fireCooldownMs: 500, moveSpeed: 310, projectileSpeed: 650 });
  });

  it("records the static-target TTK reference for each character", () => {
    expect(CHARACTER_BALANCE.map(({ id, ttkReferenceMs, shotCountToDefeat100 }) => ({ id, ttkReferenceMs, shotCountToDefeat100 }))).toEqual([
      { id: "blaze", ttkReferenceMs: 2_400, shotCountToDefeat100: 5 },
      { id: "medic", ttkReferenceMs: 2_800, shotCountToDefeat100: 6 },
      { id: "fortress", ttkReferenceMs: 2_600, shotCountToDefeat100: 5 },
      { id: "arc", ttkReferenceMs: 2_520, shotCountToDefeat100: 8 },
      { id: "phase", ttkReferenceMs: 2_700, shotCountToDefeat100: 4 },
      { id: "runner", ttkReferenceMs: 2_500, shotCountToDefeat100: 6 },
    ]);
  });
});
