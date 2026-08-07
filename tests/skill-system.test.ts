import { describe, expect, it } from "vitest";

import {
  MAX_SKILL_ORBS,
  SKILL_ACTION_MAX_JUMP,
  SKILL_ORB_RADIUS,
  SKILL_ORB_SPAWN_MAX_MS,
  SKILL_ORB_SPAWN_MIN_MS,
  SKILL_ORB_SPAWN_POINTS,
  WALLS,
} from "../src/shared/constants";
import { SKILL_TYPES } from "../src/shared/skill-catalog";
import { circleHitsRect } from "../src/shared/math";
import {
  advanceSkillSystem,
  applySkillAction,
  collectSkillOrb,
  createSkillSystem,
  seedInitialSkillOrbs,
} from "../src/server/skill-system";

describe("v3 skill orb model", () => {
  it("spawns at most six orbs at safe points with a four-to-seven second cadence", () => {
    const state = createSkillSystem(0, () => 0);

    advanceSkillSystem(state, SKILL_ORB_SPAWN_MIN_MS - 1, []);
    expect(state.orbs.size).toBe(0);
    advanceSkillSystem(state, SKILL_ORB_SPAWN_MIN_MS, []);
    expect(state.orbs.size).toBe(1);
    advanceSkillSystem(state, SKILL_ORB_SPAWN_MIN_MS * 8, []);

    expect(state.orbs.size).toBe(MAX_SKILL_ORBS);
    expect(state.nextSpawnAt - state.lastSpawnAt).toBeGreaterThanOrEqual(SKILL_ORB_SPAWN_MIN_MS);
    expect(state.nextSpawnAt - state.lastSpawnAt).toBeLessThanOrEqual(SKILL_ORB_SPAWN_MAX_MS);
    for (const orb of state.orbs.values()) {
      expect(SKILL_ORB_SPAWN_POINTS).toContainEqual({ x: orb.x, y: orb.y });
      expect(WALLS.some((wall) => circleHitsRect(orb, SKILL_ORB_RADIUS, wall))).toBe(false);
    }
  });

  it("seeds two immediately available skill orbs for a new match", () => {
    const state = createSkillSystem(0, () => 0);
    expect(seedInitialSkillOrbs(state, [])).toBe(2);
    expect(state.orbs.size).toBe(2);
  });

  it("deals every skill from the rotation bag before repeating and replaces the old slot without scoring", () => {
    const state = createSkillSystem(0, () => 0);
    const holder = { score: 7, skillSlot: { type: null, charges: 0 as const } };
    const dealt: string[] = [];

    for (let index = 1; index <= SKILL_TYPES.length; index += 1) {
      advanceSkillSystem(state, index * SKILL_ORB_SPAWN_MIN_MS, []);
      const orb = [...state.orbs.values()][0]!;
      dealt.push(orb.type);
      expect(collectSkillOrb(state, holder, orb.id)).toBe(true);
      expect(holder.skillSlot).toEqual({ type: orb.type, charges: 1 });
      expect(holder.score).toBe(7);
    }

    expect(new Set(dealt)).toEqual(new Set(SKILL_TYPES));
  });

  it("accepts only monotonic safe skill action sequences and consumes one held skill", () => {
    const player = {
      lastProcessedSkillAction: 0,
      skillSlot: { type: "dash" as const, charges: 1 as const },
    };

    expect(applySkillAction(player, 1)).toEqual({ accepted: true, skill: "dash" });
    expect(player.skillSlot).toEqual({ type: null, charges: 0 });
    expect(applySkillAction(player, 1)).toEqual({ accepted: false, skill: null });
    expect(applySkillAction(player, 0)).toEqual({ accepted: false, skill: null });
    expect(applySkillAction(player, Number.NaN)).toEqual({ accepted: false, skill: null });
    expect(applySkillAction(player, 1.5)).toEqual({ accepted: false, skill: null });
    expect(applySkillAction(player, 1 + SKILL_ACTION_MAX_JUMP + 1)).toEqual({ accepted: false, skill: null });
    expect(applySkillAction(player, 2)).toEqual({ accepted: true, skill: null });
  });
});
