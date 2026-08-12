import { describe, expect, it } from "vitest";

import { collectDeviceProfile, type DeviceProfileNavigator } from "../src/client/device-profile";

function fakeNavigator(overrides: Partial<DeviceProfileNavigator> = {}): DeviceProfileNavigator {
  return {
    userAgent: "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36",
    maxTouchPoints: 0,
    hardwareConcurrency: 8,
    ...overrides,
  };
}

describe("device diagnostic profile", () => {
  it("does not invent an iPhone model from viewport dimensions", () => {
    const profile = collectDeviceProfile(
      fakeNavigator({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5,
      }),
      { width: 932, height: 430 },
      3,
    );

    expect(profile.deviceModel).toBeNull();
    expect(profile.platform).toBe("iOS");
    expect(profile.browser).toBe("Safari");
  });

  it("uses a browser-provided model and guarded network capabilities", () => {
    const profile = collectDeviceProfile(
      fakeNavigator({
        userAgentData: { model: "Pixel 10" },
        connection: { effectiveType: "4g", downlink: 18.5, rtt: 35, saveData: false },
        deviceMemory: 8,
      }),
      { width: 1920, height: 1080 },
      2,
    );

    expect(profile.deviceModel).toBe("Pixel 10");
    expect(profile.network).toEqual({ effectiveType: "4g", downlinkMbps: 18.5, estimatedRttMs: 35, saveData: false });
  });
});
