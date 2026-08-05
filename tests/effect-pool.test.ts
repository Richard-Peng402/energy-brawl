import { describe, expect, it, vi } from "vitest";

import {
  FixedObjectPool,
  characterTextureKey,
  deriveCharacterVisualState,
  resolveCharacterTextureKey,
  shouldRenderEffect,
} from "../src/client/effect-pool";

describe("v3 render effect pool", () => {
  it("allocates a fixed capacity once and then reuses objects in order", () => {
    const factory = vi.fn((index: number) => ({ index, uses: 0 }));
    const pool = new FixedObjectPool(2, factory, (item) => { item.uses += 1; });

    const first = pool.acquire();
    const second = pool.acquire();
    const reused = pool.acquire();

    expect(factory).toHaveBeenCalledTimes(2);
    expect(pool.capacity).toBe(2);
    expect(reused).toBe(first);
    expect([first.uses, second.uses]).toEqual([2, 1]);
  });

  it("falls back to the generated character-color texture after an asset load failure", () => {
    const requested = characterTextureKey("medic", "move");

    expect(resolveCharacterTextureKey("medic", "move", new Set())).toBe(requested);
    expect(resolveCharacterTextureKey("medic", "move", new Set([requested])))
      .toBe(characterTextureKey("medic", "generated-fallback"));
  });

  it("derives death, hit, attack, movement, and idle visuals in combat priority order", () => {
    expect(deriveCharacterVisualState({ alive: false, speed: 40, attackUntil: 200, hitUntil: 200 }, 100)).toBe("death");
    expect(deriveCharacterVisualState({ alive: true, speed: 40, attackUntil: 200, hitUntil: 200 }, 100)).toBe("hit");
    expect(deriveCharacterVisualState({ alive: true, speed: 40, attackUntil: 200, hitUntil: 0 }, 100)).toBe("attack");
    expect(deriveCharacterVisualState({ alive: true, speed: 40, attackUntil: 0, hitUntil: 0 }, 100)).toBe("move");
    expect(deriveCharacterVisualState({ alive: true, speed: 0, attackUntil: 0, hitUntil: 0 }, 100)).toBe("idle");
  });

  it("never removes combat-readable effects in low performance mode", () => {
    for (const effect of ["muzzle", "trail", "hit", "shield", "dash", "heal", "respawn"] as const) {
      expect(shouldRenderEffect(effect, true)).toBe(true);
    }
    expect(shouldRenderEffect("environment", true)).toBe(false);
    expect(shouldRenderEffect("environment", false)).toBe(true);
  });
});
