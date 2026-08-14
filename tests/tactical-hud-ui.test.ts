import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("v4.4 tactical HUD UI", () => {
  it("adds one reusable radar canvas and an independent edge cue layer", () => {
    expect(app).toContain('id="tactical-radar"');
    expect(app).toContain('id="tactical-cues"');
    expect(app).toContain("buildRadarFrame");
    expect(app).toContain("buildTacticalCues");
    expect(styles).toContain(".tactical-radar");
    expect(styles).toContain("pointer-events: none");
  });

  it("adds a compact synchronized map-mechanic status outside the controls", () => {
    expect(app).toContain('id="map-mechanic-status"');
    expect(app).toContain("mapMechanicStatusText");
    expect(styles).toContain(".map-mechanic-status");
    expect(extractBlock(styles, ".map-mechanic-status")).toContain("pointer-events: none");
  });

  it("renders an MVP summary and fixed-column post-match table", () => {
    expect(app).toContain('id="result-mvp"');
    expect(app).toContain("result-table-head");
    expect(app).toContain("is-mvp");
    for (const label of ["K/D/A", "伤害", "治疗", "承伤", "技能", "积分"]) expect(app).toContain(label);
    expect(styles).toContain("grid-template-columns:");
    expect(styles).toContain(".result-row.is-mvp");
  });

  it("labels team identity in the lobby roster and in-match leaderboard", () => {
    expect(app).toContain("teamLabel(player.teamId)");
    expect(app).toContain("leader-team");
    expect(app).toContain("teamLabel(own?.teamId)");
  });

  it("keeps team identity visible in the post-match result table", () => {
    expect(app).toContain("result-team");
    expect(app).toContain("teamLabel(player.teamId)");
    expect(styles).toContain(".result-team");
  });

  it("keeps radar and cues outside both landscape touch-stick zones", () => {
    const compact = extractBlock(styles, "@media (max-width: 720px) and (orientation: landscape)");
    expect(compact).toContain(".tactical-radar");
    expect(compact).toContain("width:");
    expect(compact).toContain(".tactical-cue");
  });

  it("moves the radar away from the right-side skill controls on phone and tablet landscape", () => {
    const landscape = extractBlock(styles, "@media (max-width: 1000px) and (orientation: landscape)");
    const radar = extractBlock(landscape, ".tactical-radar");

    expect(radar).toContain("left:");
    expect(radar).toContain("right: auto");
    expect(radar).toContain("top:");
  });

  it("places the radar below the leaderboard instead of sharing its top-right slot", () => {
    const leaderboard = extractBlock(styles, ".leaderboard");
    const radar = extractBlock(styles, ".tactical-radar");

    expect(styles).toMatch(/\.hud-layer\s*\{[^}]*--leaderboard-top:[^}]*--leaderboard-height:/s);
    expect(leaderboard).toContain("top: var(--leaderboard-top)");
    expect(radar).toContain("var(--leaderboard-top)");
    expect(radar).toContain("var(--leaderboard-height)");
  });
});

function extractBlock(css: string, header: string): string {
  const start = css.indexOf(header);
  const open = css.indexOf("{", start);
  if (start < 0 || open < 0) return "";
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}" && --depth === 0) return css.slice(open + 1, index);
  }
  return "";
}
