import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const gameSceneSource = readFileSync(new URL("../src/client/game-scene.ts", import.meta.url), "utf8");

describe("high-fidelity render configuration", () => {
  it("requests the browser high-performance GPU path without disabling antialiasing", () => {
    expect(gameSceneSource).toContain('powerPreference: "high-performance"');
    expect(gameSceneSource).toContain("antialiasGL: true");
    expect(gameSceneSource).toContain("Phaser.Scale.NONE");
    expect(gameSceneSource).toContain("resolveRenderMetrics");
  });
});
