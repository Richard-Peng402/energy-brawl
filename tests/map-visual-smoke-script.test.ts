import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../scripts/map-visual-smoke.mjs", import.meta.url), "utf8");

describe("map visual smoke player flow", () => {
  it("joins and readies through the rendered browser flow without assuming Blaze is free", () => {
    expect(source).toContain('button.classList.contains("is-ready")');
    expect(source).toContain("const ensureReady = async () =>");
    expect(source).toContain("document.querySelector('[data-character-id]:not(:disabled)')");
    expect(source).not.toContain('[data-character-id="blaze"]');
    expect(source).not.toContain("const readyDisabled");
    expect(source).toContain("Ready was not confirmed:");
    expect(source).toContain("document.querySelector('#join-form')");
    expect(source).not.toContain("button.textContent?.includes");
    expect(source).not.toContain("const playerSocket = await connectSocket()");
  });

  it("captures the complete tactical, event, results, and host preset visual matrix", () => {
    expect(source).toContain('{ id: "desktop", width: 1_536, height: 864, dpr: 1');
    expect(source).toContain('{ id: "iphone-landscape", width: 932, height: 430, dpr: 3');
    expect(source).toContain('{ id: "ipad-landscape", width: 1_180, height: 820, dpr: 2');
    expect(source).toContain("captureViewportState");
    expect(source).toContain("lobby-tactical-modules");
    expect(source).toContain("event-warning");
    expect(source).toContain("event-active");
    expect(source).toContain("results-highlights");
    expect(source).toContain("host-preset-bar");
    expect(source).toContain("#character-detail [data-tactical-module-id]");
    expect(source).toContain("#map-event-status.is-visible");
    expect(source).toContain("#result-highlights .match-highlight-card");
    expect(source).toContain(".host-preset-bar");
    expect(source).toContain("/host?token=");
  });

  it("asserts full-resolution, nonblank, unclipped, non-overlapping rendering", () => {
    expect(source).toContain("HiDPI mismatch");
    expect(source).toContain("Nonblank canvas assertion failed");
    expect(source).toContain("Horizontal overflow");
    expect(source).toContain("Control overlap");
    expect(source).toContain("document.documentElement.scrollWidth");
    expect(source).toContain("#exclusive-skill-button");
    expect(source).toContain("#skill-button");
    expect(source).toContain("#move-stick");
    expect(source).toContain("#aim-stick");
  });

  it("runs short event captures in a separate match for each device", () => {
    expect(source).toContain("targetDevices = devices");
    expect(source).toContain("targetDevices: [device]");
    expect(source).toContain("for (const device of devices)");
  });

  it("records the authoritative event phase at the full screenshot boundary", () => {
    expect(source).toContain("const eventAtCapture = latestGame?.mapEvent");
    expect(source).toContain("observedEventPhase: eventAtCapture?.phase");
    expect(source.indexOf("const eventAtCapture = latestGame?.mapEvent")).toBeLessThan(
      source.indexOf('const screenshot = await cdp.send("Page.captureScreenshot"'),
    );
    expect(source).not.toContain("const event = latestGame?.mapEvent ?? null");
  });

  it("covers team elimination HUD, spectator and round result states", () => {
    expect(source).toContain('teamElimination3v3');
    expect(source).toContain("#elimination-hud:not(.is-hidden)");
    expect(source).toContain("#elimination-spectator:not(.is-hidden)");
    expect(source).toContain("#elimination-round-result:not(.is-hidden)");
    expect(source).toContain("observedRoundPhase");
    expect(source).toContain("roundScores");
    expect(source).toContain("team-elimination-spectator");
    expect(source).toContain("team-elimination-round-result");
    expect(source).toContain("team-elimination-next-round");
    expect(source).toContain("localPlayerId");
    expect(source).toContain("localAlive = false");
    expect(source).toContain("localAlive = true");
    expect(source).toContain("eliminationRules: { maxScoredRounds: 7");
    expect(source).toContain('type: "applyRoomPreset"');
  });

  it("requires event geometry whenever the visual event has a bounded area", () => {
    expect(source).toContain("Event boundary assertion failed");
    expect(source).toContain("eventAtCapture?.point ?? eventAtCapture?.zone");
  });
});
