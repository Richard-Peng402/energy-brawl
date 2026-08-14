import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { calculateArenaCameraZoom, MobileViewport, readViewport } from "../src/client/mobile-viewport";

const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("mobile viewport", () => {
  it("fills ultra-wide landscape screens while preserving the reference vertical view", () => {
    expect(calculateArenaCameraZoom(430, 864)).toBeCloseTo(430 / 864);
    expect(calculateArenaCameraZoom(375, 864)).toBeCloseTo(375 / 864);
  });

  it("prefers visual viewport dimensions", () => {
    expect(readViewport({ width: 844, height: 390 }, 932, 430, false)).toEqual({
      width: 844,
      height: 390,
      landscape: true,
      fullscreen: false,
    });
  });

  it("falls back to window dimensions", () => {
    expect(readViewport(null, 667, 375, true)).toEqual({
      width: 667,
      height: 375,
      landscape: true,
      fullscreen: true,
    });
  });

  it("resets input for disruptive lifecycle events", () => {
    const fixture = createFixture();
    fixture.viewport.start();
    fixture.windowTarget.dispatchEvent(new Event("blur"));
    fixture.windowTarget.dispatchEvent(new Event("orientationchange"));
    fixture.documentTarget.dispatchEvent(new Event("visibilitychange"));
    fixture.documentTarget.dispatchEvent(new Event("fullscreenchange"));
    expect(fixture.resets).toBe(4);
    fixture.viewport.stop();
  });

  it("requests fullscreen and landscape lock", async () => {
    const fixture = createFixture();
    await expect(fixture.viewport.requestFullscreen()).resolves.toBe(true);
    expect(fixture.fullscreenRequests).toBe(1);
    expect(fixture.orientationLocks).toEqual(["landscape"]);
  });

  it("returns false when fullscreen is unavailable", async () => {
    const fixture = createFixture(false);
    await expect(fixture.viewport.requestFullscreen()).resolves.toBe(false);
    expect(fixture.orientationLocks).toEqual([]);
  });

  it("caps the lobby mechanism card for 844x390 and 932x430 landscape viewports", () => {
    expect(styles).toContain("@media (max-height: 470px) and (orientation: landscape)");
    expect(styles).toContain(".map-mechanic-card");
    expect(styles).toContain("max-height: 86px");
    expect(styles).toContain(".character-selection-stage");
    expect(styles).toContain(".roster-panel");
    expect(styles).toContain(".ready-button");
  });
});

function createFixture(fullscreenAvailable = true) {
  const windowTarget = Object.assign(new EventTarget(), {
    innerWidth: 844,
    innerHeight: 390,
    visualViewport: null,
  });
  const documentTarget = Object.assign(new EventTarget(), {
    fullscreenElement: null as object | null,
    hidden: false,
    documentElement: {} as { requestFullscreen?: () => Promise<void> },
  });
  let fullscreenRequests = 0;
  if (fullscreenAvailable) {
    documentTarget.documentElement.requestFullscreen = async () => {
      fullscreenRequests += 1;
      documentTarget.fullscreenElement = {};
    };
  }
  const orientationLocks: string[] = [];
  const screenTarget = {
    orientation: {
      lock: async (orientation: string) => { orientationLocks.push(orientation); },
    },
  };
  let resets = 0;
  const viewport = new MobileViewport(
    () => { resets += 1; },
    { window: windowTarget, document: documentTarget, screen: screenTarget },
  );
  return {
    viewport,
    windowTarget,
    documentTarget,
    orientationLocks,
    get fullscreenRequests() { return fullscreenRequests; },
    get resets() { return resets; },
  };
}
