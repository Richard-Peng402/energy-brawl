import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONTROL_SETTINGS,
  normalizeControlSettings,
  resolveKeyboardControl,
} from "../src/client/control-settings";

describe("player control settings", () => {
  it("normalizes persisted key bindings and prevents duplicate actions", () => {
    const settings = normalizeControlSettings({
      keys: { moveUp: "KeyI", moveDown: "KeyI", fire: "Space" },
      touch: { skillX: 2, skillY: -1, exclusiveX: 0.72, exclusiveY: 0.55, scale: 9 },
    });

    expect(settings.keys.moveUp).toBe("KeyI");
    expect(settings.keys.moveDown).toBe(DEFAULT_CONTROL_SETTINGS.keys.moveDown);
    expect(settings.touch).toEqual({ skillX: 0.94, skillY: 0.08, exclusiveX: 0.72, exclusiveY: 0.55, scale: 1.35 });
  });

  it("derives movement, firing and skill actions from remapped keys", () => {
    const settings = normalizeControlSettings({ keys: { moveUp: "KeyI", fire: "KeyF", skill: "KeyQ", exclusiveSkill: "KeyE" } });
    const state = resolveKeyboardControl(new Set(["KeyI", "KeyD", "KeyF", "KeyE"]), settings.keys);

    expect(state.move.x).toBeCloseTo(Math.SQRT1_2);
    expect(state.move.y).toBeCloseTo(-Math.SQRT1_2);
    expect(state.firing).toBe(true);
    expect(state.skill).toBe(false);
    expect(state.exclusiveSkill).toBe(true);
  });
});
