import { describe, expect, it } from "vitest";

import { buildServerInfo, applyNoStoreHeaders, getAllowedLanAddresses } from "../src/server/server-info";
import type { NetworkSnapshot } from "../src/shared/network";
import type { RoomSnapshot } from "../src/shared/protocol";

const room: RoomSnapshot = { phase: "lobby", canStart: false, pendingWinnerId: null, players: [] };

function snapshot(overrides: Partial<NetworkSnapshot> = {}): NetworkSnapshot {
  return {
    revision: "revision-1",
    checkedAt: 1_000,
    status: "ready",
    primaryUrl: "http://192.168.1.10:3000/",
    candidates: [{ interfaceName: "WLAN", address: "192.168.1.10", kind: "wifi", isDefaultRoute: true, url: "http://192.168.1.10:3000/" }],
    warnings: [],
    ...overrides,
  };
}

describe("server info contract", () => {
  it("exposes the current network snapshot and only creates QR codes for usable candidates", () => {
    const info = buildServerInfo(snapshot(), room, "4.2.3");
    expect(info.network.revision).toBe("revision-1");
    expect(info.joinUrls).toEqual(["http://192.168.1.10:3000/"]);
    expect(info.qrDataUrls).toEqual([]);
  });

  it("does not expose a phone URL when topology is unavailable", () => {
    const info = buildServerInfo(snapshot({ status: "unavailable", primaryUrl: null, candidates: [] }), room, "4.2.3");
    expect(info.joinUrls).toEqual([]);
    expect(info.qrDataUrls).toEqual([]);
  });

  it("sets explicit no-store response headers", () => {
    const headers = new Map<string, string>();
    applyNoStoreHeaders({ setHeader(name: string, value: string) { headers.set(name, value); } });
    expect(headers.get("Cache-Control")).toContain("no-store");
    expect(headers.get("Pragma")).toBe("no-cache");
    expect(headers.get("Expires")).toBe("0");
  });

  it("keeps virtual and VPN candidates out of the exact Socket.IO allowlist", () => {
    const network = snapshot({
      candidates: [
        { interfaceName: "WLAN", address: "192.168.1.10", kind: "wifi", isDefaultRoute: true, url: "http://192.168.1.10:3000/" },
        { interfaceName: "VPN", address: "100.64.0.2", kind: "virtual", isDefaultRoute: false, url: "http://100.64.0.2:3000/" },
      ],
    });
    expect(getAllowedLanAddresses(network)).toEqual(["192.168.1.10"]);
  });
});
