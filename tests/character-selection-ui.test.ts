import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getExclusiveSkillCounterSummary } from "../src/shared/exclusive-skill-catalog";
import { canReadyAfterCharacterSelection, shouldRequireCharacterReselection } from "../src/client/network";

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

  it("shows exact shared skill counters and counterplay in the dossier", () => {
    expect(getExclusiveSkillCounterSummary("blaze")).toContain("340");
    expect(getExclusiveSkillCounterSummary("fortress")).toContain("45%");
    expect(getExclusiveSkillCounterSummary("phase")).toContain("250ms");
    expect(getExclusiveSkillCounterSummary("runner")).toContain("28%");
    expect(appSource).toContain("getExclusiveSkillCounterSummary");
    expect(appSource).toContain("技能参数");
  });

  it("requires returning players to confirm a character before readying again", () => {
    expect(shouldRequireCharacterReselection("finished", "lobby", true)).toBe(true);
    expect(shouldRequireCharacterReselection("lobby", "lobby", true)).toBe(false);
    expect(shouldRequireCharacterReselection("finished", "lobby", false)).toBe(false);
    expect(canReadyAfterCharacterSelection(false, false)).toBe(false);
    expect(canReadyAfterCharacterSelection(false, true)).toBe(true);
    expect(appSource).toContain("回到大厅并重新选角");
  });

  it("refreshes the lobby immediately after the server confirms a character", () => {
    expect(appSource).toMatch(
      /if \(result\.ok\) \{\s*this\.hasSelectedCharacter = true;\s*this\.renderColors\(\);\s*this\.renderRoster\(\);\s*\}/,
    );
  });
});
