import { describe, expect, it } from "vitest";
import { getSkillIndicatorProfile, SkillIndicatorController } from "../src/client/skill-indicator";

describe("independent exclusive skill indicator", () => {
  it("tracks a thick skill range without changing the attack aim vector", () => {
    const controller = new SkillIndicatorController();
    expect(controller.begin("phase", { x: 10, y: 20 }, 420)).toMatchObject({ skillId: "phase", range: 420, visible: true });
    expect(controller.update({ x: 3, y: 4 })).toMatchObject({ direction: { x: 0.6, y: 0.8 }, range: 420, visible: true });
    expect(controller.release().visible).toBe(false);
  });

  it("provides a readable, role-specific indicator profile for every exclusive skill", () => {
    for (const skillId of ["blaze", "medic", "fortress", "arc", "phase", "runner"] as const) {
      const profile = getSkillIndicatorProfile(skillId);
      expect(profile.range).toBeGreaterThan(0);
      expect(profile.thickness).toBeGreaterThanOrEqual(14);
      expect(profile.shape).toBeTruthy();
    }
  });
});
