import { describe, expect, it } from "vitest";
import { NetworkHealth } from "../src/client/network-health";

describe("network health", () => {
  it("reports RTT, heartbeat loss, reconnects and severity", () => {
    const health = new NetworkHealth({ windowSize: 10 });
    health.recordHeartbeat({ sentAt: 0, receivedAt: 80 });
    health.recordHeartbeat({ sentAt: 1000, receivedAt: null });
    health.recordReconnect();
    expect(health.snapshot()).toMatchObject({ rttMs: 80, lossPercent: 50, reconnects: 1, level: "unstable" });
  });

  it("keeps only the configured rolling window", () => {
    const health = new NetworkHealth({ windowSize: 2 });
    health.recordHeartbeat({ sentAt: 0, receivedAt: 40 });
    health.recordHeartbeat({ sentAt: 0, receivedAt: 60 });
    health.recordHeartbeat({ sentAt: 0, receivedAt: 100 });
    expect(health.snapshot().rttMs).toBe(80);
    expect(health.snapshot().lossPercent).toBe(0);
  });
});
