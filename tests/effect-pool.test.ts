import { describe, expect, it, vi } from "vitest";

import {
  FixedObjectPool,
  ReusableObjectPool,
  characterDirectionFromAngle,
  characterDirectionTextureKey,
  characterTextureKey,
  characterWeaponKind,
  deriveCharacterVisualState,
  resolveCharacterDirectionTextureKey,
  resolveCharacterTextureKey,
  shouldRenderEffect,
} from "../src/client/effect-pool";

describe("v3 render effect pool", () => {
  it("assigns a readable gun skin to every character", () => {
    expect(([
      "blaze", "medic", "fortress", "arc", "phase", "runner",
    ] as const).map(characterWeaponKind)).toEqual([
      "ember-cannon", "cyan-heavy", "white-tech", "violet-rifle", "cyan-heavy", "ember-cannon",
    ]);
  });
  it("quantizes aim angles into eight stable character directions", () => {
    expect(characterDirectionFromAngle(0)).toBe("right");
    expect(characterDirectionFromAngle(Math.PI / 4)).toBe("down-right");
    expect(characterDirectionFromAngle(Math.PI / 2)).toBe("down");
    expect(characterDirectionFromAngle(3 * Math.PI / 4)).toBe("down-left");
    expect(characterDirectionFromAngle(Math.PI)).toBe("left");
    expect(characterDirectionFromAngle(-3 * Math.PI / 4)).toBe("up-left");
    expect(characterDirectionFromAngle(-Math.PI / 2)).toBe("up");
    expect(characterDirectionFromAngle(-Math.PI / 4)).toBe("up-right");
    expect(characterDirectionFromAngle(Math.PI * 2)).toBe("right");
    expect(characterDirectionTextureKey("phase", "up-left")).toBe("character:phase:direction:up-left");
  });

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

  it("leases only its fixed capacity and reuses a released object", () => {
    const factory = vi.fn((index: number) => ({ index, visible: false }));
    const pool = new ReusableObjectPool(2, factory, (item) => { item.visible = false; });

    const first = pool.acquire((item) => { item.visible = true; });
    const second = pool.acquire();
    expect(pool.acquire()).toBeNull();
    expect(factory).toHaveBeenCalledTimes(2);

    expect(pool.release(first!)).toBe(true);
    expect(pool.acquire()).toBe(first);
    expect(pool.release(first!)).toBe(true);
    expect(pool.release(first!)).toBe(false);
    expect(second).not.toBeNull();
  });

  it("falls back to the generated character-color texture after an asset load failure", () => {
    const requested = characterTextureKey("medic", "move");

    expect(resolveCharacterTextureKey("medic", "move", new Set())).toBe(requested);
    expect(resolveCharacterTextureKey("medic", "move", new Set([requested])))
      .toBe(characterTextureKey("medic", "generated-fallback"));
  });

  it("falls back from a missing direction frame without losing the combat state fallback", () => {
    const direction = characterDirectionTextureKey("medic", "up");
    expect(resolveCharacterDirectionTextureKey("medic", "up", "move", new Set())).toBe(direction);
    expect(resolveCharacterDirectionTextureKey("medic", "up", "move", new Set([direction])))
      .toBe(characterTextureKey("medic", "move"));
    expect(resolveCharacterDirectionTextureKey(
      "medic",
      "up",
      "move",
      new Set([direction, characterTextureKey("medic", "move")]),
    )).toBe(characterTextureKey("medic", "generated-fallback"));
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

  it("drops decorative sparks but keeps readable combat effects in reduced mode", () => {
    expect(shouldRenderEffect("spark", true)).toBe(false);
    expect(shouldRenderEffect("trail", true)).toBe(true);
    expect(shouldRenderEffect("impact", true)).toBe(true);
  });
});
