import { describe, expect, it } from "vitest";

import { isDisplacementSkill, resolveSkillStickDirection } from "../src/client/skill-direction-control";

describe("exclusive skill direction stick", () => {
  it("uses its own dragged direction instead of attack or movement aim", () => {
    expect(resolveSkillStickDirection({ x: -0.3, y: 0.4, magnitude: 0.5 }, { x: 1, y: 0 })).toEqual({ x: -0.6, y: 0.8 });
  });

  it("falls back to the character facing direction when released without dragging", () => {
    expect(resolveSkillStickDirection({ x: 0.01, y: 0, magnitude: 0.01 }, { x: 0, y: -2 })).toEqual({ x: 0, y: -1 });
  });

  it("marks every teleporting character skill as displacement", () => {
    expect(isDisplacementSkill("blaze")).toBe(true);
    expect(isDisplacementSkill("phase")).toBe(true);
    expect(isDisplacementSkill("medic")).toBe(false);
  });
});
