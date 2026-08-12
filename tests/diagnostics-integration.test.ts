import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const gameSceneSource = readFileSync(new URL("../src/client/game-scene.ts", import.meta.url), "utf8");
const mobileAppSource = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");

describe("client diagnostics integration", () => {
  it("observes real render frames and authoritative input acknowledgements", () => {
    expect(gameSceneSource).toContain("export interface GameDiagnosticHooks");
    expect(gameSceneSource).toContain("this.diagnosticHooks.onFrame(delta)");
    expect(gameSceneSource).toContain("this.diagnosticHooks.onAuthoritativeInput(player.lastProcessedInput)");
  });

  it("records each locally sent input before transport", () => {
    const recordIndex = mobileAppSource.indexOf("this.diagnostics.recordInputSent(input.seq, time)");
    const sendIndex = mobileAppSource.indexOf("this.network.sendInput(input)");
    expect(recordIndex).toBeGreaterThan(-1);
    expect(sendIndex).toBeGreaterThan(recordIndex);
  });

  it("flushes diagnostics against the server-issued match session", () => {
    expect(mobileAppSource).toContain("new ClientDiagnosticsCollector(() => this.network.diagnosticsMatchId)");
    expect(mobileAppSource).toContain("this.network.sendDiagnosticsSample(sample)");
    expect(mobileAppSource).toContain("this.network.measureDiagnosticsRtt()");
  });

  it("keeps the high-fidelity render policy while adding observations", () => {
    expect(gameSceneSource).toContain('powerPreference: "high-performance"');
    expect(gameSceneSource).toContain("antialiasGL: true");
    expect(gameSceneSource).not.toContain("lowPerformance");
  });
});
