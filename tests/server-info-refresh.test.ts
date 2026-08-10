import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerInfoRefreshController } from "../src/client/server-info-refresh";
import type { ServerInfo } from "../src/shared/protocol";

function info(revision: string, address = "192.168.1.10"): ServerInfo {
  const url = `http://${address}:3000/`;
  return {
    name: "能量乱斗",
    version: "4.2.3",
    joinUrls: [url],
    qrDataUrls: [`qr:${revision}`],
    network: {
      revision,
      checkedAt: Date.now(),
      status: "ready",
      primaryUrl: url,
      candidates: [{ interfaceName: "WLAN", address, kind: "wifi", isDefaultRoute: true, url }],
      warnings: [],
    },
    room: { phase: "lobby", canStart: false, pendingWinnerId: null, players: [] },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ServerInfoRefreshController", () => {
  it("loads immediately and polls every three seconds", async () => {
    vi.useFakeTimers();
    const fetchInfo = vi.fn().mockResolvedValue(info("r1"));
    const controller = new ServerInfoRefreshController({ fetchInfo });

    controller.start();
    await Promise.resolve();
    expect(fetchInfo).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchInfo).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it("refreshes on online, focus, and returning to a visible document", async () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    let visible = false;
    const fetchInfo = vi.fn().mockResolvedValue(info("r1"));
    const controller = new ServerInfoRefreshController({ fetchInfo, windowTarget, documentTarget, isDocumentVisible: () => visible });
    controller.start();
    await Promise.resolve();

    windowTarget.dispatchEvent(new Event("online"));
    windowTarget.dispatchEvent(new Event("focus"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    visible = true;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    expect(fetchInfo).toHaveBeenCalledTimes(4);
    controller.stop();
  });

  it("does not let an older response overwrite a newer network revision", async () => {
    const resolvers: Array<(value: ServerInfo) => void> = [];
    const controller = new ServerInfoRefreshController({
      fetchInfo: () => new Promise<ServerInfo>((resolve) => resolvers.push(resolve)),
    });
    const revisions: string[] = [];
    controller.subscribe((state) => {
      if (state.info) revisions.push(state.info.network.revision);
    });

    const oldRequest = controller.refresh();
    const newRequest = controller.refresh();
    resolvers[1]?.(info("new", "192.168.1.11"));
    await newRequest;
    resolvers[0]?.(info("old"));
    await oldRequest;

    expect(revisions.at(-1)).toBe("new");
    controller.stop();
  });

  it("marks the last known address stale after a refresh failure", async () => {
    const fetchInfo = vi.fn()
      .mockResolvedValueOnce(info("r1"))
      .mockRejectedValueOnce(new Error("offline"));
    const controller = new ServerInfoRefreshController({ fetchInfo });
    await controller.refresh();
    await controller.refresh();

    expect(controller.state.info?.network.revision).toBe("r1");
    expect(controller.state.stale).toBe(true);
    expect(controller.state.error).toBe("offline");
  });

  it("reports whether the QR revision actually changed", async () => {
    const fetchInfo = vi.fn()
      .mockResolvedValueOnce(info("r1"))
      .mockResolvedValueOnce(info("r1"))
      .mockResolvedValueOnce(info("r2"));
    const controller = new ServerInfoRefreshController({ fetchInfo });

    await controller.refresh();
    expect(controller.state.networkChanged).toBe(true);
    await controller.refresh();
    expect(controller.state.networkChanged).toBe(false);
    await controller.refresh();
    expect(controller.state.networkChanged).toBe(true);
  });
});
