import { describe, expect, it } from "vitest";

import { CHARACTER_SELECTION_ASSETS } from "../src/client/asset-registry";

describe("character selection portraits", () => {
  it("uses a front-facing frame for every lobby card", () => {
    expect(CHARACTER_SELECTION_ASSETS).toMatchObject({
      blaze: "/assets/v3/characters/blaze/portrait.png",
      medic: "/assets/v3/characters/medic/directions/up.png",
      fortress: "/assets/v3/characters/fortress/portrait.png",
      arc: "/assets/v3/characters/arc/directions/up.png",
      phase: "/assets/v3/characters/phase/portrait.png",
      runner: "/assets/v3/characters/runner/directions/up.png",
    });
    for (const asset of Object.values(CHARACTER_SELECTION_ASSETS)) expect(asset).not.toContain("directions/down.png");
  });
});
