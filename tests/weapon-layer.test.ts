import { describe, expect, it } from "vitest";

import { getPlayerChildLayerOrder, resolveWeaponTransform } from "../src/client/effect-pool";

describe("player weapon render layer", () => {
  it("keeps the weapon above the character inside the player container", () => {
    const layers = getPlayerChildLayerOrder();
    expect(layers.indexOf("weapon")).toBeGreaterThan(layers.indexOf("sprite"));
    expect(new Set(layers).size).toBe(layers.length);
  });

  it("preserves aim rotation while positioning the weapon around the player", () => {
    const transform = resolveWeaponTransform(Math.PI / 2, 22);
    expect(transform.rotation).toBeCloseTo(Math.PI / 2);
    expect(transform.x).toBeCloseTo(0);
    expect(transform.y).toBeCloseTo(22);
  });
});
