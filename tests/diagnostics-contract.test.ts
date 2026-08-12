import { describe, expect, it } from "vitest";

import {
  DIAGNOSTIC_THRESHOLDS,
  classifyDiagnosticSample,
  isClientDiagnosticSample,
  isDiagnosticReport,
  type ClientDiagnosticSample,
  type DiagnosticReport,
} from "../src/shared/diagnostics";

const sample = (overrides: Partial<ClientDiagnosticSample> = {}): ClientDiagnosticSample => ({
  schemaVersion: 1,
  matchId: "match-1",
  sampledAt: 1_000,
  rttMs: 40,
  inputAckP50Ms: 38,
  inputAckP95Ms: 55,
  inputAckMaxMs: 70,
  frameP50Ms: 16.7,
  frameP95Ms: 18,
  frameMaxMs: 22,
  correctionP95Px: 2,
  correctionMaxPx: 4,
  hardCorrections: 0,
  stalls: 0,
  pendingInputs: 1,
  reconnects: 0,
  connected: true,
  network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false },
  ...overrides,
});

describe("diagnostic contract", () => {
  it("uses the approved fixed thresholds", () => {
    expect(DIAGNOSTIC_THRESHOLDS).toEqual({
      rttMs: 120,
      inputAckP95Ms: 100,
      correctionPx: 30,
      frameMs: 50,
      serverStepMs: 16,
    });
  });

  it("classifies every exceeded category once", () => {
    expect(classifyDiagnosticSample(sample({
      rttMs: 121,
      inputAckP95Ms: 101,
      correctionMaxPx: 31,
      frameMaxMs: 51,
      reconnects: 1,
    }))).toEqual(["network", "input", "correction", "frame", "reconnect"]);
  });

  it("rejects non-finite and oversized samples", () => {
    expect(isClientDiagnosticSample(sample({ frameMaxMs: Number.NaN }))).toBe(false);
    expect(isClientDiagnosticSample(sample({ matchId: "x".repeat(129) }))).toBe(false);
  });

  it("validates a bounded anonymized report", () => {
    const report: DiagnosticReport = {
      schemaVersion: 1,
      gameVersion: "4.3.2",
      matchId: "match-1",
      mapId: "crystal-ruins",
      matchMode: "team3v3",
      startedAt: 1_000,
      finishedAt: 9_000,
      endReason: "normal",
      players: [],
      server: { samples: [], alertCounts: { server: 0 } },
      totalAlerts: 0,
    };
    expect(isDiagnosticReport(report)).toBe(true);
    expect(isDiagnosticReport({ ...report, matchId: "x".repeat(129) })).toBe(false);
  });
});
