import { describe, expect, it } from "vitest";

import {
  getExclusiveSkillVfxProfile,
  resolveExclusiveSkillAreaFeedback,
  resolveExclusiveSkillEndVariant,
  resolveExclusiveTimedVisualState,
} from "../src/client/exclusive-skill-vfx";
import type { PlayerSnapshot } from "../src/shared/protocol";
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

  it("defines distinct Medic and Fortress area feedback", () => {
    expect(getExclusiveSkillVfxProfile("pulse-heal").features).toEqual(expect.arrayContaining([
      "healing-flow",
      "cleanse-sparkle",
    ]));
    expect(getExclusiveSkillVfxProfile("mobile-bulwark").features).toEqual(expect.arrayContaining([
      "self-facing",
      "ally-shimmer",
      "enemy-suppression",
      "shield-contact",
      "normal-end",
    ]));
  });

  it("selects Medic and Fortress target feedback from authoritative metadata", () => {
    const players = [
      { id: "caster", teamId: "red" },
      { id: "ally", teamId: "red" },
      { id: "enemy", teamId: "blue" },
    ] as PlayerSnapshot[];
    const baseEvent = {
      eventSeq: 1,
      serverTime: 0,
      playerId: "caster",
      stage: "active" as const,
      origin: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
    };
    expect(resolveExclusiveSkillAreaFeedback({
      ...baseEvent,
      skillId: "pulse-heal",
      metadata: { healedTargetIds: ["ally"], cleansedTargetIds: ["caster", "ally"] },
    }, players)).toEqual([
      { kind: "healing-flow", targetId: "ally" },
      { kind: "cleanse-sparkle", targetId: "caster" },
      { kind: "cleanse-sparkle", targetId: "ally" },
    ]);
    expect(resolveExclusiveSkillAreaFeedback({
      ...baseEvent,
      skillId: "mobile-bulwark",
      metadata: { affectedTargetIds: ["ally", "enemy"] },
    }, players)).toEqual([
      { kind: "ally-shimmer", targetId: "ally" },
      { kind: "enemy-suppression", targetId: "enemy" },
    ]);
  });

  it("defines authoritative timed presentation for Arc and Runner", () => {
    expect(getExclusiveSkillVfxProfile("capacitor-overload").features).toEqual(expect.arrayContaining([
      "weapon-charge",
      "active-current",
      "enhanced-muzzle",
      "safe-discharge",
    ]));
    expect(getExclusiveSkillVfxProfile("afterimage-run").features).toEqual(expect.arrayContaining([
      "acceleration-burst",
      "pooled-afterimages",
      "enhanced-projectile-exhaust",
      "merge-end",
    ]));
    expect(getExclusiveSkillVfxProfile("afterimage-run").poolCapacity).toBeGreaterThanOrEqual(3);
  });

  it("derives Arc and Runner intensity from authoritative active time", () => {
    expect(resolveExclusiveTimedVisualState("capacitor-overload", 1_000, 5_000, 1_000)).toMatchObject({
      progress: 0,
      afterimageCount: 0,
    });
    expect(resolveExclusiveTimedVisualState("capacitor-overload", 1_000, 5_000, 3_000).intensity).toBeGreaterThan(0.95);
    expect(resolveExclusiveTimedVisualState("afterimage-run", 1_000, 5_000, 3_000).afterimageCount).toBeGreaterThanOrEqual(3);
    expect(resolveExclusiveSkillEndVariant("capacitor-overload", "expired")).toBe("safe-discharge");
    expect(resolveExclusiveSkillEndVariant("afterimage-run", "expired")).toBe("merge-end");
  });
});
