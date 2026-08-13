import { describe, expect, it } from "vitest";
import { combatCameraImpulse, getExclusiveEffectProfile, getStatusEffectVisualProfile } from "../src/client/skill-effects";

describe("exclusive skill visual profiles", () => {
  it("keeps every timed buff visible with multiple additive layers", () => {
    for (const skillId of ["mobile-bulwark", "capacitor-overload", "afterimage-run"] as const) {
      const profile = getExclusiveEffectProfile(skillId);
      expect(profile.persistent).toBe(true);
      expect(profile.layers).toBeGreaterThanOrEqual(4);
      expect(profile.pulseMs).toBeGreaterThanOrEqual(360);
      expect(profile.pulseMs).toBeLessThanOrEqual(900);
    }
  });

  it("keeps anchor and healing feedback persistent for their server state window", () => {
    expect(getExclusiveEffectProfile("breach")).toMatchObject({ persistent: true, layers: 5 });
    expect(getExclusiveEffectProfile("pulse-heal").layers).toBeGreaterThanOrEqual(4);
  });

  it("gives every authoritative counter state a readable visual profile", () => {
    expect(getStatusEffectVisualProfile("phase-reveal")).toMatchObject({ color: 0xc77dff, label: "显形" });
    expect(getStatusEffectVisualProfile("phase-fire-lock")).toMatchObject({ label: "武器锁定" });
    expect(getStatusEffectVisualProfile("bulwark-suppression")).toMatchObject({ label: "火力压制" });
  });

  it("caps camera feedback to the approved duration and displacement", () => {
    expect(combatCameraImpulse("hurt")).toMatchObject({ maxCssPx: 6, durationMs: 90, throttleMs: 300 });
    expect(combatCameraImpulse("death")).toMatchObject({ maxCssPx: 10, durationMs: 160, throttleMs: 300 });
  });
});
