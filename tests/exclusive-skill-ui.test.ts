import { describe, expect, it } from "vitest";
import { canPressExclusiveSkill, exclusiveSkillButtonMode } from "../src/client/exclusive-skill-ui";

describe("exclusive skill mobile control state", () => {
  it("keeps Blaze return available while the anchor window is active", () => {
    const player = {
      alive: true,
      characterId: "blaze",
      exclusiveSkillReadyAt: 10_000,
      exclusiveSkillState: { skillId: "breach" as const, expiresAt: 5_000, anchor: { x: 300, y: 300 } },
    };
    expect(exclusiveSkillButtonMode(player, 1_000)).toBe("anchor-return");
    expect(canPressExclusiveSkill(player, 1_000)).toBe(true);
    expect(exclusiveSkillButtonMode(player, 5_000)).toBe("cooldown");
  });

  it("keeps normal skills disabled until their server cooldown expires", () => {
    const player = { alive: true, characterId: "medic", exclusiveSkillReadyAt: 10_000, exclusiveSkillState: null };
    expect(canPressExclusiveSkill(player, 9_999)).toBe(false);
    expect(canPressExclusiveSkill(player, 10_000)).toBe(true);
  });
});
