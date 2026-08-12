import { describe, expect, it } from "vitest";

import type { ClientDiagnosticSample, ServerDiagnosticSample } from "../src/shared/diagnostics";
import { DiagnosticsSession } from "../src/server/diagnostics-session";

describe("server diagnostics session", () => {
  it("aggregates the current match and finalizes an anonymous report", () => {
    const session = new DiagnosticsSession("4.3.2");
    session.start({
      matchId: "m1",
      mapId: "crystal-ruins",
      matchMode: "team3v3",
      startedAt: 1_000,
      players: [{ playerId: "secret-id", nickname: "Secret Name", characterId: "blaze", address: "192.168.1.xxx" }],
    });
    session.acceptClientSample("secret-id", sample({ matchId: "m1", rttMs: 140 }), 1_500);
    session.acceptClientSample("secret-id", sample({ matchId: "m1", rttMs: 160 }), 1_700);
    session.recordServerSample(serverSample());

    const report = session.finish(9_000, "normal");

    expect(report?.players[0]).toMatchObject({ alias: "P1", address: "192.168.1.xxx", alertCounts: { network: 1 } });
    expect(report?.players[0]?.samples).toHaveLength(2);
    expect(JSON.stringify(report)).not.toContain("secret-id");
    expect(JSON.stringify(report)).not.toContain("Secret Name");
    expect(session.latestReport).toEqual(report);
  });

  it("rejects unknown players and samples for a different match", () => {
    const session = startedSession();

    expect(session.acceptClientSample("unknown", sample(), 1_000)).toBe(false);
    expect(session.acceptClientSample("p1", sample({ matchId: "other" }), 1_000)).toBe(false);
    expect(session.snapshot(2_000).players[0]?.sample).toBeNull();
  });

  it("replaces the active match while preserving only the latest completed report", () => {
    const session = startedSession();
    const first = session.finish(2_000, "reset");
    session.start({ matchId: "m2", mapId: "neon-docks", matchMode: "solo", startedAt: 3_000, players: [] });

    expect(session.snapshot(3_500)).toMatchObject({ matchId: "m2", mapId: "neon-docks", players: [] });
    expect(session.latestReport).toEqual(first);
  });
});

function startedSession(): DiagnosticsSession {
  const session = new DiagnosticsSession("4.3.2");
  session.start({
    matchId: "m1",
    mapId: "reactor-core",
    matchMode: "solo",
    startedAt: 0,
    players: [{ playerId: "p1", nickname: "Player", characterId: "medic", address: "本机" }],
  });
  return session;
}

function sample(overrides: Partial<ClientDiagnosticSample> = {}): ClientDiagnosticSample {
  return {
    schemaVersion: 1, matchId: "m1", sampledAt: 1_000, rttMs: 40,
    inputAckP50Ms: 30, inputAckP95Ms: 40, inputAckMaxMs: 45,
    frameP50Ms: 16, frameP95Ms: 18, frameMaxMs: 20,
    correctionP95Px: 2, correctionMaxPx: 4, hardCorrections: 0, stalls: 0,
    pendingInputs: 0, reconnects: 0, connected: true,
    network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false },
    ...overrides,
  };
}

function serverSample(): ServerDiagnosticSample {
  return { sampledAt: 1_000, stepP95Ms: 8, stepMaxMs: 10, steps: 60, catchUpLimitHits: 0, humans: 1, bots: 5, projectiles: 12, skillEffects: 2, acceptedSamples: 2, rejectedSamples: 0 };
}
