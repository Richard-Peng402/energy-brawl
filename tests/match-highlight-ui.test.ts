import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderMatchHighlights } from "../src/client/match-highlight-ui";
import type { MatchHighlight } from "../src/shared/match-highlights";

const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("post-match highlight cards", () => {
  it("escapes player names and renders the authoritative fact value", () => {
    const html = renderMatchHighlights([highlight({
      kind: "five-kill-streak",
      playerName: "<测试>",
      value: 6,
    })]);

    expect(html).toContain("&lt;测试&gt;");
    expect(html).toContain("六连杀");
    expect(html).not.toContain("<测试>");
  });

  it("renders no empty highlight container", () => {
    expect(renderMatchHighlights([])).toBe("");
  });

  it("uses the matching character portrait and readable copy for every highlight kind", () => {
    const html = renderMatchHighlights([
      highlight({ kind: "five-kill-streak", playerId: "blaze-player", playerName: "烈锋", value: 5 }),
      highlight({ kind: "capture-comeback", playerId: "fortress-player", playerName: "堡垒", value: 24 }),
      highlight({ kind: "critical-healing", playerId: "medic-player", playerName: "脉冲医师", targetPlayerName: "队友", value: 34 }),
      highlight({ kind: "hazard-escape", playerId: "runner-player", playerName: "疾行者", value: 1 }),
    ], [
      { id: "blaze-player", characterId: "blaze" },
      { id: "fortress-player", characterId: "fortress" },
      { id: "medic-player", characterId: "medic" },
      { id: "runner-player", characterId: "runner" },
    ]);

    expect(html).toContain("/assets/v3/characters/blaze/portrait.png");
    expect(html).toContain("据点逆转");
    expect(html).toContain("救下 队友");
    expect(html).toContain("危险区逃生");
    expect((html.match(/class="match-highlight-card/g) ?? [])).toHaveLength(4);
  });

  it("caps rendered cards and keeps mobile results scrollable", () => {
    const html = renderMatchHighlights(Array.from({ length: 6 }, (_, index) => highlight({
      playerId: `player-${index}`,
      playerName: `玩家${index}`,
      occurredAt: index,
    })));

    expect((html.match(/class="match-highlight-card/g) ?? [])).toHaveLength(4);
    expect(styles).toContain(".match-highlights");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain(".results-panel");
    expect(styles).toContain("overflow: auto");
  });
});

function highlight(overrides: Partial<MatchHighlight> = {}): MatchHighlight {
  return {
    kind: "hazard-escape",
    playerId: "player-1",
    playerName: "玩家一",
    value: 1,
    occurredAt: 1_000,
    ...overrides,
  };
}
