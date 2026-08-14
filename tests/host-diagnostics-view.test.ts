import { describe, expect, it } from "vitest";

import type { DiagnosticReport, HostDiagnosticsSnapshot } from "../src/shared/diagnostics";
import * as diagnosticsView from "../src/client/host-diagnostics-view";

const { diagnosticsRevision, renderDiagnosticsPlayers, resolveDiagnosticsPresentation } = diagnosticsView;

describe("host diagnostics presentation", () => {
  it("formats warnings, unsupported fields and masked addresses", () => {
    const snapshot = diagnosticSnapshot();
    expect(resolveDiagnosticsPresentation(snapshot).players[0]).toMatchObject({
      playerLabel: "测试玩家",
      rtt: "140ms",
      severity: "warning",
      device: "iOS · Safari 19 · 未知型号",
    });
    expect(renderDiagnosticsPlayers(snapshot)).toContain("192.168.1.xxx");
    expect(renderDiagnosticsPlayers(snapshot)).not.toContain("192.168.1.44");
  });

  it("renders an explicit empty state", () => {
    expect(renderDiagnosticsPlayers(null)).toContain("暂无对局诊断数据");
  });

  it("keeps revisions stable until visible metrics change", () => {
    const snapshot = diagnosticSnapshot();
    const clone = structuredClone(snapshot);
    clone.sampledAt += 400;
    expect(diagnosticsRevision(clone)).toBe(diagnosticsRevision(snapshot));
    clone.players[0]!.sample!.rttMs = 40;
    expect(diagnosticsRevision(clone)).not.toBe(diagnosticsRevision(snapshot));
  });

  it("uses the latest completed report when the active match snapshot is empty", () => {
    const resolveSnapshot = (diagnosticsView as typeof diagnosticsView & {
      resolveDiagnosticsSnapshot?: (active: HostDiagnosticsSnapshot | null, completed: DiagnosticReport | null) => HostDiagnosticsSnapshot | null;
    }).resolveDiagnosticsSnapshot;

    expect(resolveSnapshot).toBeTypeOf("function");
    const snapshot = resolveSnapshot?.(null, diagnosticReport()) ?? null;

    expect(snapshot).toMatchObject({
      matchId: "completed-match",
      mapId: "crystal-ruins",
      players: [{ alias: "P1", sample: expect.objectContaining({ rttMs: 76 }) }],
      server: expect.objectContaining({ stepMaxMs: 12 }),
    });
    expect(renderDiagnosticsPlayers(snapshot)).toContain("76ms");
  });
});

function diagnosticSnapshot(): HostDiagnosticsSnapshot {
  return {
    schemaVersion: 1, matchId: "m1", mapId: "reactor-core", matchMode: "solo", sampledAt: 1_000,
    players: [{
      playerId: "p1", nickname: "测试玩家", alias: "P1", isBot: false, connected: true,
      address: "192.168.1.xxx",
      profile: { schemaVersion: 1, browser: "Safari", browserVersion: "19", platform: "iOS", deviceModel: null, screenWidth: 932, screenHeight: 430, devicePixelRatio: 3, maxTouchPoints: 5, hardwareConcurrency: 6, deviceMemoryGb: null, network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false } },
      sample: { schemaVersion: 1, matchId: "m1", sampledAt: 1_000, rttMs: 140, inputAckP50Ms: 50, inputAckP95Ms: 70, inputAckMaxMs: 80, frameP50Ms: 16, frameP95Ms: 18, frameMaxMs: 20, correctionP95Px: 2, correctionMaxPx: 4, hardCorrections: 0, stalls: 0, pendingInputs: 0, reconnects: 0, connected: true, network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false } },
      sampleAgeMs: 0, alertCounts: { network: 1 },
    }],
    server: { sampledAt: 1_000, stepP95Ms: 8, stepMaxMs: 10, steps: 60, catchUpLimitHits: 0, humans: 1, bots: 5, projectiles: 12, skillEffects: 2, acceptedSamples: 1, rejectedSamples: 0 },
    recentAlerts: [], totalAlerts: 1,
  };
}

function diagnosticReport(): DiagnosticReport {
  const playerSample = diagnosticSnapshot().players[0]!.sample!;
  return {
    schemaVersion: 1,
    gameVersion: "4.5.0",
    matchId: "completed-match",
    mapId: "crystal-ruins",
    matchMode: "team3v3",
    startedAt: 1_000,
    finishedAt: 9_000,
    endReason: "normal",
    players: [{
      alias: "P1",
      characterId: "blaze",
      address: "192.168.1.xxx",
      profile: null,
      samples: [{ ...playerSample, matchId: "completed-match", rttMs: 76 }],
      alertCounts: {},
      reconnects: 0,
    }],
    server: { samples: [{ sampledAt: 8_000, stepP95Ms: 7, stepMaxMs: 12, steps: 60, catchUpLimitHits: 0, humans: 1, bots: 5, projectiles: 8, skillEffects: 1, acceptedSamples: 1, rejectedSamples: 0 }], alertCounts: {} },
    totalAlerts: 0,
  };
}
