import { describe, expect, it } from "vitest";

import { runDiagnosticsLoadTest, validateDiagnosticsLoadReport } from "../scripts/diagnostics-load-test";

describe("six-client diagnostics pressure gate", () => {
  it("keeps six one-hertz diagnostic clients within budget", async () => {
    const report = await runDiagnosticsLoadTest({ simulatedSeconds: 60, clients: 6, includeInvalidProbes: true });

    expect(validateDiagnosticsLoadReport(report)).toEqual([]);
    expect(report.acceptedSamples).toBe(360);
    expect(report.rejectedSamples).toBe(2);
    expect(report.invalidProbesRejected).toBe(2);
    expect(report.hostSnapshots).toBeGreaterThanOrEqual(59);
    expect(report.aggregateP95Ms).toBeLessThan(5);
    expect(report.maxSerializedSampleBytes).toBeLessThan(2_048);
    expect(report.connectedPlayers).toBe(6);
  }, 15_000);

  it("rejects invalid and over-frequency probes without disconnecting players", async () => {
    const report = await runDiagnosticsLoadTest({ simulatedSeconds: 2, clients: 6, includeInvalidProbes: true });

    expect(report.rejectedSamples).toBeGreaterThanOrEqual(2);
    expect(report.connectedPlayers).toBe(6);
  });
});
