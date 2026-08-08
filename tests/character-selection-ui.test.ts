import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("animated character selection stage", () => {
  it("keeps the right-side roster UI fixed while animating only the left preview", () => {
    expect(appSource).toContain("lobby-character-preview");
    expect(appSource).toContain("renderLobbyCharacterPreview");
    expect(appSource).toContain("preview-energy-field");
    expect(appSource).toContain("preview-impact");
    expect(appSource).toContain("lobby-intro");
  });

  it("uses calm pixel-art motion and a strict two-column split", () => {
    expect(styles).toContain("@keyframes lobby-background-shift");
    expect(styles).toContain("@keyframes preview-character-assemble");
    expect(styles).toContain("@keyframes preview-impact-burst");
    expect(styles).toContain("@keyframes preview-title-enter");
    expect(styles).toContain("image-rendering: pixelated");
  });
});
