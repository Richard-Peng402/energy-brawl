import { describe, expect, it } from "vitest";

import { maskNetworkAddress } from "../src/server/network-address";

describe("network address masking", () => {
  it.each([
    ["192.168.1.44", "192.168.1.xxx"],
    ["::ffff:192.168.1.44", "192.168.1.xxx"],
    ["127.0.0.1", "本机"],
    ["::1", "本机"],
    ["2001:db8:abcd:12::4", "2001:db8:abcd:12::/64"],
  ])("masks %s", (address, expected) => {
    expect(maskNetworkAddress(address)).toBe(expected);
  });

  it("never echoes invalid or missing input", () => {
    expect(maskNetworkAddress(undefined)).toBe("未知");
    expect(maskNetworkAddress("not-an-address")).toBe("未知");
  });
});
