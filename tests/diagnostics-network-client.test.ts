import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ClientDiagnosticSample,
  DeviceDiagnosticProfile,
  DiagnosticReport,
  HostDiagnosticsSnapshot,
} from "../src/shared/diagnostics";

const sockets: FakeSocket[] = [];

class FakeSocket {
  private readonly handlers = new Map<string, Array<(...args: never[]) => void>>();
  readonly emit = vi.fn();
  readonly volatile = { emit: vi.fn() };
  disconnect = vi.fn();

  on(event: string, handler: (...args: never[]) => void): this {
    const entries = this.handlers.get(event) ?? [];
    entries.push(handler);
    this.handlers.set(event, entries);
    return this;
  }

  trigger(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args as never[]);
  }
}

vi.mock("socket.io-client", () => ({
  io: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));

import { GameNetworkClient } from "../src/client/network";

beforeEach(() => {
  sockets.length = 0;
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("diagnostic network client", () => {
  it("uses volatile transport for one-second samples", () => {
    const client = new GameNetworkClient(false);
    const socket = sockets[0]!;
    socket.trigger("connect");
    const diagnosticSample = sample();

    client.sendDiagnosticsSample(diagnosticSample);

    expect(socket.volatile.emit).toHaveBeenCalledWith("diagnosticsSample", diagnosticSample);
  });

  it("sends a device profile once per connected session", () => {
    const client = new GameNetworkClient(false);
    const socket = sockets[0]!;
    const diagnosticProfile = profile();
    socket.trigger("connect");

    client.sendDiagnosticsProfile(diagnosticProfile);
    client.sendDiagnosticsProfile(diagnosticProfile);
    socket.trigger("disconnect");
    socket.trigger("connect");
    client.sendDiagnosticsProfile(diagnosticProfile);

    expect(socket.emit.mock.calls.filter(([event]) => event === "diagnosticsProfile")).toHaveLength(2);
  });

  it("measures RTT from local elapsed time", async () => {
    const client = new GameNetworkClient(false);
    const socket = sockets[0]!;
    socket.trigger("connect");
    socket.emit.mockImplementation((event: string, sentAt: number, acknowledge: (value: number) => void) => {
      if (event === "diagnosticsPing") acknowledge(sentAt);
    });
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(145);

    await expect(client.measureDiagnosticsRtt(now, 100)).resolves.toBe(45);
  });

  it("stores dedicated diagnostic state without changing room or game", () => {
    const client = new GameNetworkClient(false);
    const socket = sockets[0]!;
    const snapshot = hostSnapshot();
    const report = diagnosticReport();

    socket.trigger("diagnosticsSession", { matchId: "match-1" });
    socket.trigger("hostDiagnostics", snapshot);
    socket.trigger("diagnosticReport", report);

    expect(client.diagnosticsMatchId).toBe("match-1");
    expect(client.hostDiagnostics).toEqual(snapshot);
    expect(client.latestDiagnosticReport).toEqual(report);
    expect(client.room).toBeNull();
    expect(client.game).toBeNull();
  });

  it("rejects a delayed host subscription acknowledgement from an old connection", async () => {
    const client = new GameNetworkClient(false);
    const socket = sockets[0]!;
    socket.trigger("connect");
    let acknowledge: ((result: { ok: true }) => void) | null = null;
    socket.emit.mockImplementation((event: string, _payload: unknown, callback: (result: { ok: true }) => void) => {
      if (event === "subscribeHostDiagnostics") acknowledge = callback;
    });

    const pending = client.subscribeHostDiagnostics("token");
    socket.trigger("disconnect");
    socket.trigger("connect");
    acknowledge!({ ok: true });

    await expect(pending).resolves.toMatchObject({ ok: false });
  });
});

function sample(): ClientDiagnosticSample {
  return {
    schemaVersion: 1,
    matchId: "match-1",
    sampledAt: 1_000,
    rttMs: 40,
    inputAckP50Ms: 30,
    inputAckP95Ms: 40,
    inputAckMaxMs: 45,
    frameP50Ms: 16,
    frameP95Ms: 18,
    frameMaxMs: 20,
    correctionP95Px: 2,
    correctionMaxPx: 4,
    hardCorrections: 0,
    stalls: 0,
    pendingInputs: 0,
    reconnects: 0,
    connected: true,
    network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false },
  };
}

function profile(): DeviceDiagnosticProfile {
  return {
    schemaVersion: 1,
    browser: "Safari",
    browserVersion: "19",
    platform: "iOS",
    deviceModel: null,
    screenWidth: 932,
    screenHeight: 430,
    devicePixelRatio: 3,
    maxTouchPoints: 5,
    hardwareConcurrency: 6,
    deviceMemoryGb: null,
    network: sample().network,
  };
}

function hostSnapshot(): HostDiagnosticsSnapshot {
  return { schemaVersion: 1, matchId: "match-1", mapId: "reactor-core", matchMode: "solo", sampledAt: 1_000, players: [], server: null, recentAlerts: [], totalAlerts: 0 };
}

function diagnosticReport(): DiagnosticReport {
  return { schemaVersion: 1, gameVersion: "4.3.2", matchId: "match-1", mapId: "reactor-core", matchMode: "solo", startedAt: 0, finishedAt: 1_000, endReason: "normal", players: [], server: { samples: [], alertCounts: {} }, totalAlerts: 0 };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}
