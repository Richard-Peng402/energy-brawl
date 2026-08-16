import { describe, expect, it, vi } from "vitest";

import { CombatHaptics, type HapticsMode } from "../src/client/combat-haptics";
import type { CombatFeedbackEvent } from "../src/client/combat-feedback";

const event = (type: CombatFeedbackEvent["type"], key: string, streak?: number): CombatFeedbackEvent => ({
  type,
  key,
  at: 1_000,
  streak,
});

describe("combat haptics", () => {
  it("maps local combat feedback to bounded vibration patterns", () => {
    const vibrate = vi.fn(() => true);
    const haptics = new CombatHaptics({ vibrate, now: () => 1_000 });

    haptics.handleEvents([
      event("hurt", "hurt:1"),
      event("low-health", "low:1"),
      event("kill", "kill:1", 5),
    ]);

    expect(vibrate).toHaveBeenCalledTimes(3);
    for (const call of vibrate.mock.calls as unknown as Array<[number | readonly number[]]>) {
      const pattern = call[0];
      const values: number[] = Array.isArray(pattern) ? [...pattern] : [pattern];
      expect(values.every((value) => value <= 120)).toBe(true);
      expect(values.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(300);
    }
  });

  it("deduplicates event keys and throttles repeated hit feedback", () => {
    const vibrate = vi.fn(() => true);
    let now = 1_000;
    const haptics = new CombatHaptics({ vibrate, now: () => now });

    haptics.handleEvents([event("hurt", "hurt:1")]);
    haptics.handleEvents([event("hurt", "hurt:1"), event("hurt", "hurt:2")]);
    expect(vibrate).toHaveBeenCalledTimes(1);
    now += 141;
    haptics.handleEvents([event("hurt", "hurt:3")]);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it.each<HapticsMode>(["off", "light", "standard", "strong"])("supports %s mode", (mode) => {
    const vibrate = vi.fn(() => true);
    const haptics = new CombatHaptics({ vibrate, mode, now: () => 1_000 });
    haptics.handleEvents([event("kill", `kill:${mode}`, 1)]);
    expect(vibrate).toHaveBeenCalledTimes(mode === "off" ? 0 : 1);
  });

  it("does not throw when vibration is unavailable and exposes fallback feedback", () => {
    const fallback = vi.fn();
    const haptics = new CombatHaptics({ onFallback: fallback, now: () => 1_000 });
    expect(() => haptics.handleEvents([event("hurt", "hurt:fallback")])).not.toThrow();
    expect(fallback).toHaveBeenCalledWith("hurt");
  });

  it("stops active vibration on lifecycle changes and death", () => {
    const vibrate = vi.fn(() => true);
    const haptics = new CombatHaptics({ vibrate, now: () => 1_000 });
    haptics.handleEvents([event("hurt", "hurt:stop")]);
    haptics.stop();
    expect(vibrate).toHaveBeenLastCalledWith(0);
    haptics.handleEvents([event("death", "death:stop")]);
    expect(vibrate).toHaveBeenCalledWith([110, 40, 110]);
  });

  it("plays distinct map-mechanic feedback through the shared haptics mode", () => {
    const vibrate = vi.fn(() => true);
    const haptics = new CombatHaptics({ vibrate, now: () => 1_000 });

    haptics.handleMapMechanicEvent({
      key: "crystal-resonance:1:2:active",
      kind: "crystal-resonance",
      stage: "active",
      at: 1_000,
    });

    expect(vibrate).toHaveBeenCalledWith([38, 28, 38, 28, 62]);
  });

  it("plays deduplicated local exclusive skill stages and ignores remote skills", () => {
    const vibrate = vi.fn(() => true);
    const haptics = new CombatHaptics({ vibrate, now: () => 1_000 });
    const localCast = { key: "skill:1", skillId: "breach" as const, stage: "cast" as const, relationship: "local" as const };

    haptics.handleExclusiveSkillEvent(localCast);
    haptics.handleExclusiveSkillEvent(localCast);
    haptics.handleExclusiveSkillEvent({ key: "skill:2", skillId: "phase-shift", stage: "cast", relationship: "enemy" });
    haptics.handleExclusiveSkillEvent({ key: "skill:3", skillId: "breach", stage: "end", relationship: "local" });

    expect(vibrate).toHaveBeenCalledTimes(2);
    const calls = vibrate.mock.calls as unknown as Array<[number | readonly number[]]>;
    expect(calls[0]?.[0]).not.toEqual(calls[1]?.[0]);
  });
});
