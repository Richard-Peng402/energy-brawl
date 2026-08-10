import { describe, expect, it } from "vitest";

import { NetworkSnapshotProvider } from "../src/server/network-snapshot-provider";
import type { NetworkSnapshot } from "../src/shared/network";

function snapshot(revision: string): NetworkSnapshot {
  return { revision, checkedAt: 1, status: "ready", primaryUrl: `http://${revision}:3000/`, candidates: [], warnings: [] };
}

describe("NetworkSnapshotProvider", () => {
  it("reuses a snapshot within the short cache window and refreshes after expiry", async () => {
    let now = 0;
    let calls = 0;
    const provider = new NetworkSnapshotProvider(async () => snapshot(`v${++calls}`), () => now, 1_500);

    expect((await provider.get()).revision).toBe("v1");
    expect((await provider.get()).revision).toBe("v1");
    now = 1_500;
    expect((await provider.get()).revision).toBe("v2");
    expect(calls).toBe(2);
  });

  it("shares an in-flight discovery request between concurrent callers", async () => {
    let resolve: ((value: NetworkSnapshot) => void) | undefined;
    let calls = 0;
    const provider = new NetworkSnapshotProvider(() => {
      calls += 1;
      return new Promise<NetworkSnapshot>((finish) => { resolve = finish; });
    });

    const first = provider.get();
    const second = provider.get();
    resolve?.(snapshot("shared"));
    expect((await first).revision).toBe("shared");
    expect((await second).revision).toBe("shared");
    expect(calls).toBe(1);
  });
});
