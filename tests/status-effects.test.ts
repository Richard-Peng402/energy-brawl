import { describe, expect, it } from "vitest";

import {
  addStatusEffect,
  clearAllStatusEffects,
  clearPurifiableStatus,
  expireStatusEffects,
  hasActiveStatusEffect,
  type StatusEffectStore,
} from "../src/server/status-effects";

describe("authoritative status effects", () => {
  it("refreshes suppression instead of stacking it", () => {
    const store: StatusEffectStore = new Map();
    addStatusEffect(store, "bulwark-suppression", 1_000, 2_000);
    addStatusEffect(store, "bulwark-suppression", 1_500, 2_500);
    expect(store.get("bulwark-suppression")).toEqual({ id: "bulwark-suppression", startedAt: 1_500, expiresAt: 4_000, purifiable: true });
  });

  it("clears only purifiable effects and expires old effects by server time", () => {
    const store: StatusEffectStore = new Map();
    addStatusEffect(store, "bulwark-suppression", 0, 1_000);
    addStatusEffect(store, "phase-reveal", 0, 1_200);
    addStatusEffect(store, "phase-fire-lock", 0, 250);
    expect(clearPurifiableStatus(store)).toEqual(["bulwark-suppression"]);
    expect(hasActiveStatusEffect(store, "phase-reveal", 1_100)).toBe(true);
    expireStatusEffects(store, 1_201);
    expect(store.size).toBe(0);
  });

  it("keeps map buffs non-purifiable while still expiring by server time", () => {
    const store: StatusEffectStore = new Map();
    addStatusEffect(store, "neon-overdrive", 1_000, 1_000);
    addStatusEffect(store, "crystal-resonance", 1_000, 6_000);

    expect(clearPurifiableStatus(store)).toEqual([]);
    expect(hasActiveStatusEffect(store, "neon-overdrive", 1_999)).toBe(true);
    expect(hasActiveStatusEffect(store, "crystal-resonance", 6_999)).toBe(true);
    expireStatusEffects(store, 7_000);
    expect(store.size).toBe(0);
  });

  it("clears every temporary effect on death or round reset", () => {
    const store: StatusEffectStore = new Map();
    addStatusEffect(store, "phase-reveal", 0, 1_200);
    addStatusEffect(store, "phase-fire-lock", 0, 250);
    clearAllStatusEffects(store);
    expect(store.size).toBe(0);
  });
});
