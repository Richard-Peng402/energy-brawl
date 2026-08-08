import { describe, expect, it } from "vitest";
import { applyExclusiveSkill, advanceExclusiveSkillEffects, canUseExclusiveSkill, type ExclusiveSkillPlayer } from "../src/server/exclusive-skill-system";

const player = (characterId: ExclusiveSkillPlayer["characterId"]): ExclusiveSkillPlayer => ({ id: characterId, characterId, x: 300, y: 300, angle: 0, health: 50, maxHealth: 100, alive: true, teamId: "red", moveSpeed: 250, fireCooldownMs: 450, damage: 25 });

describe("authoritative exclusive skills", () => {
  it("describes and applies all six character skills with independent cooldown", () => {
    for (const id of ["blaze", "medic", "fortress", "arc", "phase", "runner"] as const) {
      const state = player(id);
      const result = applyExclusiveSkill(state, 0, { x: 1, y: 0 });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.definition.characterId).toBe(id);
      expect(canUseExclusiveSkill(state, 1)).toBe(false);
      expect(state.exclusiveSkillReadyAt).toBe(10_000);
    }
  });

  it("leaves a Blaze anchor, dashes once, then returns to anchor", () => {
    const state = player("blaze");
    const created = applyExclusiveSkill(state, 0, { x: 1, y: 0 });
    expect(created).toMatchObject({ ok: true, definition: { id: "breach" }, state: { anchor: { x: 300, y: 300 }, usedDash: true } });
    const returned = applyExclusiveSkill(state, 1_000, { x: 0, y: 0 });
    expect(returned).toMatchObject({ ok: true, target: { x: 300, y: 300 }, state: null });
  });

  it("expires timed effects and rejects dead players", () => {
    const state = player("runner");
    applyExclusiveSkill(state, 0, { x: 1, y: 0 });
    advanceExclusiveSkillEffects([state], 5_001);
    expect(state.exclusiveSkillState).toBeNull();
    state.alive = false;
    state.exclusiveSkillReadyAt = 0;
    expect(applyExclusiveSkill(state, 6_000, { x: 1, y: 0 })).toMatchObject({ ok: false });
  });
});
