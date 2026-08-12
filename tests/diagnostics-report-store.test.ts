import { describe, expect, it } from "vitest";

import type { DiagnosticReport } from "../src/shared/diagnostics";
import { DiagnosticsReportStore, serializeDiagnosticReports } from "../src/client/diagnostics-report-store";

describe("diagnostic report storage", () => {
  it("keeps only the newest ten valid reports", () => {
    const storage = memoryStorage();
    const store = new DiagnosticsReportStore(storage);
    for (let index = 1; index <= 12; index += 1) store.save(report({ matchId: `m${index}`, finishedAt: index }));

    expect(store.list().map((item) => item.matchId)).toEqual(["m12", "m11", "m10", "m9", "m8", "m7", "m6", "m5", "m4", "m3"]);
  });

  it("exports only whitelisted anonymous fields", () => {
    const unsafe = report() as DiagnosticReport & Record<string, unknown>;
    unsafe.nickname = "Secret Name";
    unsafe.token = "secret-token";
    unsafe.rawAddress = "192.168.1.44";
    (unsafe.players[0] as unknown as Record<string, unknown>).playerId = "secret-player-id";
    (unsafe.players[0]!.samples as unknown[]).push({ ...sample(), token: "nested-secret-token", payload: "x".repeat(10_000) });

    const json = serializeDiagnosticReports([unsafe], 5_000);

    expect(json).not.toContain("Secret Name");
    expect(json).not.toContain("secret-token");
    expect(json).not.toContain("192.168.1.44");
    expect(json).not.toContain("secret-player-id");
    expect(json).not.toContain("nested-secret-token");
    expect(json).not.toContain("payload");
    expect(JSON.parse(json)).toMatchObject({ schemaVersion: 1, exportedAt: 5_000, reports: [{ players: [{ alias: "P1" }] }] });
  });

  it("ignores corrupt stored JSON and invalid reports", () => {
    const storage = memoryStorage();
    storage.setItem("energy-brawl.diagnostics-reports.v1", "not-json");
    const store = new DiagnosticsReportStore(storage);
    expect(store.list()).toEqual([]);

    storage.setItem("energy-brawl.diagnostics-reports.v1", JSON.stringify([{ nope: true }]));
    expect(store.list()).toEqual([]);
  });

  it("evicts the oldest report and retries once after a quota failure", () => {
    const storage = quotaStorage();
    const store = new DiagnosticsReportStore(storage);
    for (let index = 1; index <= 3; index += 1) store.save(report({ matchId: `m${index}`, finishedAt: index }));
    storage.failNextWrite();

    const result = store.save(report({ matchId: "m4", finishedAt: 4 }));

    expect(result.persisted).toBe(true);
    expect(result.reports.map((item) => item.matchId)).toEqual(["m4", "m3", "m2"]);
  });

  it("keeps evicting old reports until a larger new report fits", () => {
    const storage = boundedStorage(3_000);
    const store = new DiagnosticsReportStore(storage);
    for (let index = 1; index <= 4; index += 1) store.save(report({ matchId: `m${index}`, finishedAt: index }));
    const large = report({
      matchId: "large",
      finishedAt: 10,
      players: [{ ...report().players[0]!, samples: Array.from({ length: 5 }, (_, index) => sample(index)) }],
    });

    const result = store.save(large);

    expect(result.persisted).toBe(true);
    expect(result.reports[0]?.matchId).toBe("large");
    expect(result.reports.length).toBeLessThan(4);
  });
});

function report(overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  return {
    schemaVersion: 1,
    gameVersion: "4.3.2",
    matchId: "m1",
    mapId: "reactor-core",
    matchMode: "solo",
    startedAt: 0,
    finishedAt: 1,
    endReason: "normal",
    players: [{ alias: "P1", characterId: "blaze", address: "192.168.1.xxx", profile: null, samples: [], alertCounts: {}, reconnects: 0 }],
    server: { samples: [], alertCounts: {} },
    totalAlerts: 0,
    ...overrides,
  };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); }, setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function quotaStorage(): Storage & { failNextWrite(): void } {
  const storage = memoryStorage() as Storage & { failNextWrite(): void };
  const originalSet = storage.setItem.bind(storage);
  let fail = false;
  storage.failNextWrite = () => { fail = true; };
  storage.setItem = (key, value) => {
    if (fail) {
      fail = false;
      throw new DOMException("quota", "QuotaExceededError");
    }
    originalSet(key, value);
  };
  return storage;
}

function boundedStorage(maxLength: number): Storage {
  const storage = memoryStorage();
  const originalSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (value.length > maxLength) throw new DOMException("quota", "QuotaExceededError");
    originalSet(key, value);
  };
  return storage;
}

function sample(index = 0) {
  return {
    schemaVersion: 1 as const, matchId: "m1", sampledAt: index, rttMs: 40,
    inputAckP50Ms: 30, inputAckP95Ms: 40, inputAckMaxMs: 45,
    frameP50Ms: 16, frameP95Ms: 18, frameMaxMs: 20,
    correctionP95Px: 2, correctionMaxPx: 4, hardCorrections: 0, stalls: 0,
    pendingInputs: 0, reconnects: 0, connected: true,
    network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false },
  };
}
