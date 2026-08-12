import { describe, expect, it } from "vitest";

import { diagnosePlayerHealth } from "../src/client/network-diagnostics-model";

describe("player diagnostic cause model", () => {
  it.each([
    [{ rttMs: 40, inputAckP95Ms: 55 }, "normal"],
    [{ rttMs: 130, inputAckP95Ms: 80 }, "network"],
    [{ rttMs: 40, inputAckP95Ms: 180 }, "input"],
    [{ connected: false, rttMs: 20 }, "reconnect"],
    [{ serverStepMaxMs: 20, frameMaxMs: 70 }, "server"],
    [{ frameMaxMs: 70, correctionMaxPx: 50 }, "frame"],
  ] as const)("classifies %o as %s", (metrics, expected) => {
    expect(diagnosePlayerHealth(metrics)).toBe(expected);
  });
});
