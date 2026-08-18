import { describe, expect, it } from "vitest";

import {
  DEFAULT_ELIMINATION_RULES,
  resolveEliminationMatch,
  resolveEliminationRound,
} from "../src/shared/team-elimination";

describe("team elimination rules", () => {
  it("uses the seven-round defaults", () => {
    expect(DEFAULT_ELIMINATION_RULES).toEqual({
      maxScoredRounds: 7,
      prepMs: 8_000,
      liveMs: 40_000,
      overtimeMs: 10_000,
      decisiveMs: 30_000,
    });
  });

  it("awards a round to the only surviving team", () => {
    expect(resolveEliminationRound({
      aliveByTeam: { red: 3, blue: 0 },
      healthRatioByTeam: { red: 0.4, blue: 0 },
      timedOut: false,
      decisive: false,
    })).toEqual({ kind: "round", winnerTeamId: "red", reason: "eliminated" });
  });

  it("uses alive count then health ratio on timeout", () => {
    expect(resolveEliminationRound({
      aliveByTeam: { red: 2, blue: 1 },
      healthRatioByTeam: { red: 0.1, blue: 1 },
      timedOut: true,
      decisive: false,
    }).winnerTeamId).toBe("red");
    expect(resolveEliminationRound({
      aliveByTeam: { red: 1, blue: 1 },
      healthRatioByTeam: { red: 0.6, blue: 0.3 },
      timedOut: true,
      decisive: false,
    }).winnerTeamId).toBe("red");
  });

  it("uses the first elimination during decisive time", () => {
    expect(resolveEliminationRound({
      aliveByTeam: { red: 2, blue: 2 },
      healthRatioByTeam: { red: 0.2, blue: 0.9 },
      timedOut: false,
      decisive: true,
      firstEliminationTeamId: "blue",
    })).toMatchObject({ winnerTeamId: "blue", reason: "decisive" });
  });

  it("resolves a tied seven-round match through the decisive winner", () => {
    expect(resolveEliminationMatch({
      roundScores: { red: 3, blue: 3 },
      maxScoredRounds: 7,
      decisiveWinner: "blue",
    })).toEqual({ kind: "match", winnerTeamId: "blue", reason: "decisive" });
  });
});
