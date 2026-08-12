import { describe, expect, it } from "vitest";

import { ClientDiagnosticsCollector } from "../src/client/diagnostics-collector";

describe("client diagnostics collector", () => {
  it("aggregates a one-second window and clears it after flush", () => {
    const collector = new ClientDiagnosticsCollector(() => "match-1");
    [16, 17, 55].forEach((value) => collector.recordFrame(value));
    [2, 8, 40].forEach((value) => collector.recordCorrection(value, false));
    collector.recordInputSent(10, 100);
    collector.recordInputSent(11, 150);
    collector.acknowledgeInputs(11, 250);
    collector.setRtt(42);

    expect(collector.flush(1_000)).toMatchObject({
      matchId: "match-1",
      rttMs: 42,
      inputAckP50Ms: 100,
      inputAckP95Ms: 150,
      frameMaxMs: 55,
      correctionMaxPx: 40,
      stalls: 1,
      pendingInputs: 0,
    });
    expect(collector.flush(2_000)).toMatchObject({ frameMaxMs: null, inputAckP95Ms: null });
  });

  it("keeps pending input history bounded at 240 entries", () => {
    const collector = new ClientDiagnosticsCollector(() => "match-1");
    for (let seq = 1; seq <= 300; seq += 1) collector.recordInputSent(seq, seq);
    expect(collector.pendingInputCount).toBe(240);
  });

  it("returns null without an active match and tracks reconnect state", () => {
    let matchId: string | null = null;
    const collector = new ClientDiagnosticsCollector(() => matchId);
    expect(collector.flush(1_000)).toBeNull();
    matchId = "match-1";
    collector.setConnected(false);
    collector.recordReconnect();
    expect(collector.flush(2_000)).toMatchObject({ connected: false, reconnects: 1 });
  });
});
