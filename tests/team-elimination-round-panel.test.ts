import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEliminationRoundPanel } from "../src/client/elimination-ui";
import type { GameSnapshot } from "../src/shared/protocol";

const mobileSource = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("team elimination mid-round panel", () => {
  it("returns no panel before the first completed round", () => {
    expect(buildEliminationRoundPanel(snapshot([]))).toEqual({ visible: false, items: [] });
  });

  it("orders completed rounds newest first with winner and score context", () => {
    expect(buildEliminationRoundPanel(snapshot([
      { roundIndex: 1, winnerTeamId: "blue", reason: "timeout", redAlive: 1, blueAlive: 2 },
      { roundIndex: 2, winnerTeamId: "red", reason: "eliminated", redAlive: 2, blueAlive: 0 },
    ]))).toEqual({
      visible: true,
      items: [
        { roundIndex: 2, winnerLabel: "红队", reasonLabel: "全灭", scoreLabel: "存活 2 - 0" },
        { roundIndex: 1, winnerLabel: "蓝队", reasonLabel: "时间到", scoreLabel: "存活 1 - 2" },
      ],
    });
  });

  it("renders a dedicated arena panel with mobile-safe placement", () => {
    expect(mobileSource).toContain('id="elimination-round-panel"');
    expect(mobileSource).toContain("buildEliminationRoundPanel(snapshot)");
    expect(stylesSource).toContain(".elimination-round-panel");
    expect(stylesSource).toContain("right: max(12px");
  });
});

function snapshot(rounds: NonNullable<GameSnapshot["elimination"]>["rounds"]): GameSnapshot {
  return {
    serverTime: 0, phase: "playing", remainingMs: 0, overtimePlayerIds: [], winnerIds: [], holderId: null,
    holdRemainingMs: null, finishedAt: null, matchMvpId: null, matchMvpScore: null, players: [], projectiles: [],
    energy: [], skillOrbs: [], matchMode: "teamElimination3v3", elimination: {
      phase: "live", roundIndex: 3, roundScores: [{ teamId: "red", score: 1, targetScore: 4 }, { teamId: "blue", score: 1, targetScore: 4 }],
      deadline: 10_000, maxScoredRounds: 7, decisive: false, rounds,
    },
  };
}
