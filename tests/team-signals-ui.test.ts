import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("team signal HUD", () => {
  it("exposes four compact commands with desktop shortcuts", () => {
    for (const [kind, label, key] of [["group", "集合", "1"], ["attack", "进攻", "2"], ["retreat", "撤退", "3"], ["heal", "治疗", "4"]]) {
      expect(app).toContain(`data-team-signal="${kind}"`);
      expect(app).toContain(`>${label}<kbd>${key}</kbd>`);
    }
    expect(app).toContain('Digit1: "group"');
    expect(app).toContain('Digit4: "heal"');
  });

  it("keeps mobile controls compact without hiding effects or DPR", () => {
    expect(styles).toContain(".team-signals");
    expect(styles).toMatch(/@media \(max-width: 720px\)[\s\S]*\.team-signals button \{ min-width: 45px/);
    expect(app).toContain('button.classList.toggle("is-hidden", !teamMode)');
  });
});
