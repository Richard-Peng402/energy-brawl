import { describe, expect, it } from "vitest";

import { resolveHeldSkillAim, resolveMouseAim } from "../src/client/mouse-aim";

describe("mouse aim", () => {
  const arena = { left: 100, top: 50, width: 800, height: 400 };

  it("uses the arena centre as the player-facing origin", () => {
    expect(resolveMouseAim(900, 250, arena)).toEqual({ x: 1, y: 0, magnitude: 1 });
    expect(resolveMouseAim(500, 50, arena)).toEqual({ x: 0, y: -1, magnitude: 1 });
  });

  it("does not emit a direction at the centre or for an empty arena", () => {
    expect(resolveMouseAim(500, 250, arena)).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(resolveMouseAim(0, 0, { left: 0, top: 0, width: 0, height: 100 })).toEqual({ x: 0, y: 0, magnitude: 0 });
  });

  it("uses the latest mouse direction when a held exclusive-skill key is released", () => {
    expect(resolveHeldSkillAim({ x: 0.6, y: -0.8, magnitude: 1 }, { x: 1, y: 0 })).toEqual({ x: 0.6, y: -0.8 });
    expect(resolveHeldSkillAim({ x: 0, y: 0, magnitude: 0 }, { x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
  });

});
