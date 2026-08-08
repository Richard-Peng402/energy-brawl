import { describe, expect, it } from "vitest";

import { moveTouchControl, touchControlStyle } from "../src/client/touch-control-layout";
import { DEFAULT_CONTROL_SETTINGS } from "../src/client/control-settings";

describe("editable mobile control layout", () => {
  it("moves either skill control using viewport-normalized safe coordinates", () => {
    const moved = moveTouchControl(DEFAULT_CONTROL_SETTINGS.touch, "exclusive", 710, 20, { left: 10, top: 5, width: 700, height: 350 });
    expect(moved.exclusiveX).toBe(0.94);
    expect(moved.exclusiveY).toBe(0.08);
    expect(moved.skillX).toBe(DEFAULT_CONTROL_SETTINGS.touch.skillX);
  });

  it("creates a centered scalable style for a saved control", () => {
    expect(touchControlStyle({ ...DEFAULT_CONTROL_SETTINGS.touch, scale: 1.2 }, "skill")).toEqual({
      left: "91%",
      top: "53%",
      transform: "translate3d(-50%, -50%, 0) scale(1.2)",
    });
  });
});
