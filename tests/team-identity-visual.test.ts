import { describe, expect, it } from "vitest";
import { resolveTeamIdentityVisual } from "../src/client/team-identity";
import { readFileSync } from "node:fs";

const mobileSource = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("team identity visual model", () => {
  it("uses a distinct teammate marker and keeps the team name in team modes", () => {
    const visual = resolveTeamIdentityVisual({
      matchMode: "team3v3",
      playerTeamId: "red",
      localTeamId: "red",
      isLocal: false,
      isBot: false,
    });

    expect(visual.relation).toBe("teammate");
    expect(visual.marker).toBe("diamond");
    expect(visual.label).toBe("红队");
    expect(visual.ringWidth).toBeGreaterThan(4);
    expect(visual.badge).toBeNull();
  });

  it("adds an explicit AI badge without changing teammate semantics", () => {
    const visual = resolveTeamIdentityVisual({
      matchMode: "team2v2v2",
      playerTeamId: "blue",
      localTeamId: "blue",
      isLocal: false,
      isBot: true,
    });

    expect(visual.relation).toBe("teammate");
    expect(visual.marker).toBe("diamond");
    expect(visual.badge).toBe("AI");
    expect(visual.directionIndicator).toBe(true);
  });

  it("uses an enemy marker and hides team labels in solo matches", () => {
    const enemy = resolveTeamIdentityVisual({
      matchMode: "team3v3",
      playerTeamId: "gold",
      localTeamId: "red",
      isLocal: false,
      isBot: false,
    });
    const solo = resolveTeamIdentityVisual({
      matchMode: "solo",
      playerTeamId: null,
      localTeamId: null,
      isLocal: false,
      isBot: true,
    });

    expect(enemy.relation).toBe("enemy");
    expect(enemy.marker).toBe("chevron");
    expect(enemy.label).toBe("敌方");
    expect(solo.label).toBe("");
    expect(solo.marker).toBe("dot");
    expect(solo.badge).toBe("AI");
  });

  it("keeps the roster identity readable with a shape marker and takeover state", () => {
    expect(mobileSource).toContain("team-marker-");
    expect(mobileSource).toContain("AI 接管");
    expect(styles).toContain(".team-marker");
  });
});
