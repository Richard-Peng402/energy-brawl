import { describe, expect, it } from "vitest";
import {
  combatCameraImpulse,
  getExclusiveEffectProfile,
  getStatusEffectVisualProfile,
  selectCombatCameraFeedback,
} from "../src/client/skill-effects";

describe("exclusive skill visual profiles", () => {
  it("keeps every timed buff visible with multiple additive layers", () => {
    for (const skillId of ["mobile-bulwark", "capacitor-overload", "afterimage-run"] as const) {
      const profile = getExclusiveEffectProfile(skillId);
      expect(profile.persistent).toBe(true);
      expect(profile.layers).toBeGreaterThanOrEqual(4);
      expect(profile.pulseMs).toBeGreaterThanOrEqual(360);
      expect(profile.pulseMs).toBeLessThanOrEqual(900);
      expect(profile.releasePath).toBe("authoritative-state");
    }
  });

  it("keeps anchor and healing feedback persistent for their server state window", () => {
    expect(getExclusiveEffectProfile("breach")).toMatchObject({ persistent: true, layers: 5 });
    expect(getExclusiveEffectProfile("pulse-heal")).toMatchObject({ layers: expect.any(Number), releasePath: "authoritative-state" });
  });

  it("gives every authoritative counter state a readable visual profile", () => {
    expect(getStatusEffectVisualProfile("phase-reveal")).toMatchObject({ color: 0xc77dff, label: "显形" });
    expect(getStatusEffectVisualProfile("phase-fire-lock")).toMatchObject({ label: "武器锁定" });
    expect(getStatusEffectVisualProfile("bulwark-suppression")).toMatchObject({ label: "火力压制" });
  });

  it("gives map buffs distinct readable visual profiles", () => {
    expect(getStatusEffectVisualProfile("neon-overdrive")).toMatchObject({ color: 0x37cfff, label: "轨道过载" });
    expect(getStatusEffectVisualProfile("crystal-resonance")).toMatchObject({ color: 0xa978ff, label: "晶脉共鸣" });
  });

  it("caps camera feedback to the approved duration and displacement", () => {
    expect(combatCameraImpulse("hurt")).toMatchObject({ maxCssPx: 6, durationMs: 90, throttleMs: 300 });
    expect(combatCameraImpulse("kill")).toMatchObject({ maxCssPx: 7, durationMs: 120, throttleMs: 240 });
    expect(combatCameraImpulse("death")).toMatchObject({ maxCssPx: 10, durationMs: 160, throttleMs: 300 });
  });

  it("prioritizes death, then kill, then hurt for one camera impulse", () => {
    const hurt = { type: "hurt" as const, key: "hurt:1", at: 1 };
    const kill = { type: "kill" as const, key: "kill:1", at: 1, streak: 2 };
    const death = { type: "death" as const, key: "death:1", at: 1 };
    expect(selectCombatCameraFeedback([hurt, kill])).toBe(kill);
    expect(selectCombatCameraFeedback([hurt, kill, death])).toBe(death);
    expect(selectCombatCameraFeedback([])).toBeNull();
  });
});
