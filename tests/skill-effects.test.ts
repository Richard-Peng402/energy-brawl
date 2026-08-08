import { describe, expect, it } from "vitest";
import { getExclusiveEffectProfile } from "../src/client/skill-effects";

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
});
