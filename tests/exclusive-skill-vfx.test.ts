import { describe, expect, it } from "vitest";

import { getExclusiveSkillVfxProfile, resolveExclusiveSkillEndVariant } from "../src/client/exclusive-skill-vfx";
import { EXCLUSIVE_SKILL_IDS } from "../src/shared/exclusive-skill-catalog";

describe("exclusive skill VFX profiles", () => {
  it("defines telegraph, cast, active, and end for all six skills", () => {
    expect(EXCLUSIVE_SKILL_IDS).toHaveLength(6);
    for (const skillId of EXCLUSIVE_SKILL_IDS) {
      const profile = getExclusiveSkillVfxProfile(skillId);
      expect(Object.keys(profile.stages).sort()).toEqual(["active", "cast", "end", "telegraph"]);
      expect(profile.poolCapacity).toBeGreaterThanOrEqual(2);
      expect(profile.poolCapacity).toBeLessThanOrEqual(24);
      expect(profile.stages.cast.durationMs).toBeGreaterThanOrEqual(80);
      expect(profile.stages.cast.durationMs).toBeLessThanOrEqual(220);
      expect(profile.stages.active.durationMs).toBeLessThan(900);
      expect(profile.stages.end.durationMs).toBeLessThan(900);
      for (const stage of Object.values(profile.stages)) {
        expect(stage.alpha).toBeGreaterThan(0);
        expect(stage.alpha).toBeLessThanOrEqual(1);
        expect(stage.scale).toBeGreaterThan(0);
        expect(stage.textureKey).toContain(skillId);
      }
    }
  });

  it("returns a defensive copy instead of shared mutable stage data", () => {
    const first = getExclusiveSkillVfxProfile("breach");
    const second = getExclusiveSkillVfxProfile("breach");

    first.stages.cast.alpha = 0.01;

    expect(second.stages.cast.alpha).not.toBe(0.01);
    expect(first.stages.cast).not.toBe(second.stages.cast);
  });

  it("gives every skill an explicit visual identity", () => {
    const colors = EXCLUSIVE_SKILL_IDS.map((skillId) => getExclusiveSkillVfxProfile(skillId).stages.cast.color);
    expect(new Set(colors).size).toBe(EXCLUSIVE_SKILL_IDS.length);
  });

  it("defines complete displacement variants for Blaze and Phase", () => {
    expect(getExclusiveSkillVfxProfile("breach").features).toEqual(expect.arrayContaining([
      "anchor-create",
      "travel",
      "return",
      "expiry",
    ]));
    expect(getExclusiveSkillVfxProfile("phase-shift").features).toEqual(expect.arrayContaining([
      "origin-tear",
      "corridor",
      "destination-assembly",
      "closure",
    ]));
    expect(resolveExclusiveSkillEndVariant("breach", "return")).toBe("return-collapse");
    expect(resolveExclusiveSkillEndVariant("breach", "expired")).toBe("anchor-dissolve");
    expect(resolveExclusiveSkillEndVariant("phase-shift", "expired")).toBe("phase-closure");
  });
});
