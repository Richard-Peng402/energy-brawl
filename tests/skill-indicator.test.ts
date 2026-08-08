import { describe, expect, it } from "vitest";
import { SkillIndicatorController } from "../src/client/skill-indicator";

describe("independent exclusive skill indicator", () => {
  it("tracks a thick skill range without changing the attack aim vector", () => {
    const controller = new SkillIndicatorController();
    expect(controller.begin("phase", { x: 10, y: 20 }, 420)).toMatchObject({ skillId: "phase", range: 420, visible: true });
    expect(controller.update({ x: 3, y: 4 })).toMatchObject({ direction: { x: 0.6, y: 0.8 }, range: 420, visible: true });
    expect(controller.release().visible).toBe(false);
  });
});
