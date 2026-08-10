import { describe, expect, it } from "vitest";

import { discoverNetworkSnapshot, type NetworkInterfaceMap } from "../src/server/network-topology";

function address(addressValue: string, netmask = "255.255.255.0") {
  return {
    address: addressValue,
    family: "IPv4" as const,
    internal: false,
    netmask,
    mac: "00:00:00:00:00:01",
    cidr: `${addressValue}/24`,
  };
}

describe("discoverNetworkSnapshot", () => {
  it("prefers the physical interface that owns the default route", async () => {
    const interfaces: NetworkInterfaceMap = {
      "vEthernet (Default Switch)": [address("10.176.20.53")],
      WLAN: [address("192.168.123.17")],
      "WLAN 4": [address("192.168.137.1")],
    };

    const snapshot = await discoverNetworkSnapshot({
      port: 3000,
      interfaces,
      defaultGateway: { interface: "WLAN", gateway: "192.168.123.1" },
    });

    expect(snapshot.primaryUrl).toBe("http://192.168.123.17:3000/");
    expect(snapshot.status).toBe("ready");
    expect(snapshot.candidates.find((candidate) => candidate.address === "10.176.20.53")?.kind).toBe("virtual");
  });

  it("reports hotspot-only when the Windows hotspot is the only physical candidate", async () => {
    const snapshot = await discoverNetworkSnapshot({
      port: 3000,
      interfaces: { "WLAN 4": [address("192.168.137.1")] },
      defaultGateway: null,
    });

    expect(snapshot.status).toBe("hotspot-only");
    expect(snapshot.primaryUrl).toBe("http://192.168.137.1:3000/");
  });

  it("reports unavailable without a phone URL when no usable interfaces exist", async () => {
    const snapshot = await discoverNetworkSnapshot({
      port: 3000,
      interfaces: { WLAN: [address("169.254.20.10")] },
      defaultGateway: null,
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.primaryUrl).toBeNull();
    expect(snapshot.candidates).toEqual([]);
  });

  it("keeps a real non-private interface as a candidate when it is on the default route", async () => {
    const snapshot = await discoverNetworkSnapshot({
      port: 3000,
      interfaces: { Ethernet: [address("203.0.113.20")] },
      defaultGateway: { interface: "Ethernet", gateway: "203.0.113.1" },
    });

    expect(snapshot.status).toBe("ready");
    expect(snapshot.primaryUrl).toBe("http://203.0.113.20:3000/");
  });

  it("changes revision when the selected network address changes", async () => {
    const first = await discoverNetworkSnapshot({
      port: 3000,
      interfaces: { WLAN: [address("192.168.1.10")] },
      defaultGateway: { interface: "WLAN", gateway: "192.168.1.1" },
    });
    const second = await discoverNetworkSnapshot({
      port: 3000,
      interfaces: { WLAN: [address("192.168.1.11")] },
      defaultGateway: { interface: "WLAN", gateway: "192.168.1.1" },
    });

    expect(second.revision).not.toBe(first.revision);
  });

  it("selects the address sharing a subnet with the default gateway on a multi-address interface", async () => {
    const snapshot = await discoverNetworkSnapshot({
      port: 3000,
      interfaces: { Ethernet: [address("10.0.0.5"), address("192.168.1.5")] },
      defaultGateway: { interface: "Ethernet", gateway: "192.168.1.1" },
    });

    expect(snapshot.primaryUrl).toBe("http://192.168.1.5:3000/");
  });
});
