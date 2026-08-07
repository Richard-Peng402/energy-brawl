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
});
