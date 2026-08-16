import { describe, expect, it } from "vitest";
import {
  applyExclusiveSkill,
  advanceExclusiveSkillEffects,
  canUseExclusiveSkill,
  clearExclusiveSkillState,
  type ExclusiveSkillPlayer,
} from "../src/server/exclusive-skill-system";
import { getExclusiveSkillBalance } from "../src/shared/exclusive-skill-balance";

const player = (characterId: ExclusiveSkillPlayer["characterId"]): ExclusiveSkillPlayer => ({ id: characterId, characterId, x: 300, y: 300, angle: 0, health: 50, maxHealth: 100, alive: true, teamId: "red", moveSpeed: 250, fireCooldownMs: 450, damage: 25 });

describe("authoritative exclusive skills", () => {
  it("defines the approved v4.5 skill counters", () => {
    expect(getExclusiveSkillBalance("breach")).toMatchObject({ dashDistance: 340, durationMs: 5_000, dashDurationMs: 180 });
    expect(getExclusiveSkillBalance("pulse-heal")).toMatchObject({ selfHeal: 28, allyHeal: 34, radius: 280, pulseDurationMs: 350 });
    expect(getExclusiveSkillBalance("mobile-bulwark")).toMatchObject({ frontalDamageMultiplier: 0.55, allyDamageMultiplier: 0.75, suppressionFireCooldownMultiplier: 1.25, durationMs: 4_000 });
    expect(getExclusiveSkillBalance("capacitor-overload")).toMatchObject({ fireCooldownMultiplier: 0.7, moveSpeedMultiplier: 1.15, durationMs: 4_000 });
    expect(getExclusiveSkillBalance("phase-shift")).toMatchObject({ dashDistance: 400, fireLockDurationMs: 250, revealDurationMs: 1_200 });
    expect(getExclusiveSkillBalance("afterimage-run")).toMatchObject({ moveSpeedMultiplier: 1.28, damageMultiplier: 1.15, durationMs: 4_000 });
  });

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
    expect(returned).toMatchObject({ ok: true, target: { x: 300, y: 300 }, state: { returning: true, movementEndsAt: 1_180 } });
  });

  it("expires timed effects and rejects dead players", () => {
    const state = player("runner");
    applyExclusiveSkill(state, 0, { x: 1, y: 0 });
    const ended = advanceExclusiveSkillEffects([state], 5_001);
    expect(ended).toEqual([
      expect.objectContaining({ playerId: "runner", state: expect.objectContaining({ skillId: "afterimage-run" }) }),
    ]);
    expect(state.exclusiveSkillState).toBeNull();
    state.alive = false;
    state.exclusiveSkillReadyAt = 0;
    expect(applyExclusiveSkill(state, 6_000, { x: 1, y: 0 })).toMatchObject({ ok: false });
  });

  it("returns the previous runtime state when clearing", () => {
    const state = player("fortress");
    applyExclusiveSkill(state, 0, { x: 1, y: 0 });

    expect(clearExclusiveSkillState(state)).toMatchObject({ skillId: "mobile-bulwark" });
    expect(clearExclusiveSkillState(state)).toBeNull();
  });
});
