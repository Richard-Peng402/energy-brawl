import { describe, expect, it } from "vitest";

import { getLanAddresses } from "../src/server/lan-address";

describe("getLanAddresses", () => {
  it("places the active Wi-Fi address before the Windows hotspot address", () => {
    const urls = getLanAddresses(3002, {
      "WLAN 4": [
        {
          address: "192.168.137.1",
          family: "IPv4",
          internal: false,
          netmask: "255.255.255.0",
          mac: "00:00:00:00:00:01",
          cidr: "192.168.137.1/24",
        },
      ],
      WLAN: [
        {
          address: "10.228.31.110",
          family: "IPv4",
          internal: false,
          netmask: "255.255.0.0",
          mac: "00:00:00:00:00:02",
          cidr: "10.228.31.110/16",
        },
      ],
    });

    expect(urls).toEqual([
      "http://10.228.31.110:3002/",
      "http://192.168.137.1:3002/",
    ]);
  });

  it("prefers the active Wi-Fi interface when a virtual adapter is enumerated first", () => {
    const urls = getLanAddresses(3000, {
      "vEthernet (Default Switch)": [
        {
          address: "10.176.20.53",
          family: "IPv4",
          internal: false,
          netmask: "255.255.240.0",
          mac: "00:00:00:00:00:01",
          cidr: "10.176.20.53/20",
        },
      ],
      WLAN: [
        {
          address: "192.168.123.17",
          family: "IPv4",
          internal: false,
          netmask: "255.255.255.0",
          mac: "00:00:00:00:00:02",
          cidr: "192.168.123.17/24",
        },
      ],
    });

    expect(urls[0]).toBe("http://192.168.123.17:3000/");
  });
});
