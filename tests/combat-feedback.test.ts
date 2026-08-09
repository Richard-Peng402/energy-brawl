import { describe, expect, it } from "vitest";

import {
  didPickUpLocalSkill,
  effectCapacity,
  PROJECTILE_VIEW_CAPACITY,
  projectileAngle,
  shouldRenderProjectileImageEffect,
  shouldShowProjectileTrace,
  shouldEmitProjectileTrail,
  trailIntervalMs,
} from "../src/client/combat-feedback";

describe("v3.3 projectile feedback", () => {
  it("aims the arcade projectile along its velocity", () => {
    expect(projectileAngle({ x: 0, y: 12 })).toBeCloseTo(Math.PI / 2);
    expect(projectileAngle({ x: -9, y: 0 })).toBeCloseTo(Math.PI);
  });

  it("samples trails only after both the time and distance thresholds", () => {
    const memory = { x: 100, y: 100, emittedAt: 1_000 };
    expect(shouldEmitProjectileTrail(memory, { x: 120, y: 100 }, 1_020, false)).toBe(false);
    expect(shouldEmitProjectileTrail(memory, { x: 108, y: 100 }, 1_050, false)).toBe(false);
    expect(shouldEmitProjectileTrail(memory, { x: 120, y: 100 }, 1_050, false)).toBe(true);
  });

  it("keeps every projectile effect visible even when an old reduced hint is supplied", () => {
    expect(trailIntervalMs(false)).toBe(34);
    expect(trailIntervalMs(true)).toBe(34);
    expect(shouldShowProjectileTrace(false)).toBe(true);
    expect(shouldShowProjectileTrace(true)).toBe(true);
    expect(shouldRenderProjectileImageEffect("trail", true)).toBe(true);
    expect(shouldRenderProjectileImageEffect("spark", true)).toBe(true);
    expect(shouldRenderProjectileImageEffect("smoke", true)).toBe(true);
  });

  it("recognizes only an observed empty-to-filled skill transition", () => {
    expect(didPickUpLocalSkill(undefined, "dash")).toBe(false);
    expect(didPickUpLocalSkill(null, "dash")).toBe(true);
    expect(didPickUpLocalSkill("dash", "dash")).toBe(false);
    expect(didPickUpLocalSkill("dash", null)).toBe(false);
  });

  it("preallocates enough projectile and trail views for six-player crossfire", () => {
    expect(PROJECTILE_VIEW_CAPACITY).toBe(256);
    expect(effectCapacity("trail")).toBe(160);
    expect(effectCapacity("impact")).toBe(36);
    expect(effectCapacity("spark")).toBe(96);
  });
});
