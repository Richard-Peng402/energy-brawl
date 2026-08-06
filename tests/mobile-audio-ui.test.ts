import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("mobile combat audio controls", () => {
  it("exposes the same sound toggle in the lobby header and battle HUD", () => {
    expect(app).toContain('<button class="sound-button" data-sound-toggle');
    expect(app).toContain('<button class="sound-button arena-sound" data-sound-toggle');
    expect(app).toContain('aria-label="关闭声音"');
  });

  it("keeps the sound button compact and outside the control sticks", () => {
    expect(styles).toContain(".sound-button");
    expect(styles).toContain(".arena-sound");
    expect(styles).toContain("pointer-events: auto");
  });
});
