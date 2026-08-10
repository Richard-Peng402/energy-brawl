import { describe, expect, it } from "vitest";

import { resolveRenderMetrics } from "../src/client/render-metrics";

describe("resolveRenderMetrics", () => {
  it("allocates physical pixels at the device pixel ratio while preserving logical size", () => {
    expect(resolveRenderMetrics(1280, 720, 1.5)).toEqual({
      logicalWidth: 1280,
      logicalHeight: 720,
      physicalWidth: 1920,
      physicalHeight: 1080,
      dpr: 1.5,
    });
  });

  it("keeps fractional dimensions stable without changing the logical viewport", () => {
    expect(resolveRenderMetrics(801, 451, 2)).toMatchObject({
      logicalWidth: 801,
      logicalHeight: 451,
      physicalWidth: 1602,
      physicalHeight: 902,
    });
  });
});
