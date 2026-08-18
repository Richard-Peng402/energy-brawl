import { describe, expect, it } from "vitest";

import {
  DEFAULT_ELIMINATION_RULES,
  resolveEliminationMatch,
  resolveEliminationRound,
} from "../src/shared/team-elimination";
import {
  advanceElimination,
  createEliminationState,
  recordElimination,
  resetEliminationRound,
} from "../src/server/team-elimination";

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

  it("advances prep into live and then awards an elimination round", () => {
    const state = createEliminationState(0);
    expect(state).toMatchObject({ phase: "prep", roundIndex: 1, deadline: 8_000 });
    expect(advanceElimination(state, 8_000, {
      aliveByTeam: { red: 3, blue: 3 },
      healthRatioByTeam: { red: 1, blue: 1 },
    })).toEqual([{ type: "phase", phase: "live" }]);
    expect(state.phase).toBe("live");
    expect(advanceElimination(state, 48_000, {
      aliveByTeam: { red: 3, blue: 0 },
      healthRatioByTeam: { red: 1, blue: 0 },
    })).toEqual([{ type: "round-won", winnerTeamId: "red", reason: "eliminated" }]);
    expect(state.scores).toEqual({ red: 1, blue: 0 });
  });

  it("enters decisive phase after a tied overtime and resets the next round", () => {
    const state = createEliminationState(0);
    advanceElimination(state, 8_000, { aliveByTeam: { red: 3, blue: 3 }, healthRatioByTeam: { red: 1, blue: 1 } });
    expect(advanceElimination(state, 48_000, { aliveByTeam: { red: 1, blue: 1 }, healthRatioByTeam: { red: 0.5, blue: 0.5 } })).toEqual([{ type: "phase", phase: "overtime" }]);
    expect(advanceElimination(state, 58_000, { aliveByTeam: { red: 1, blue: 1 }, healthRatioByTeam: { red: 0.5, blue: 0.5 } })).toEqual([{ type: "phase", phase: "decisive" }]);
    expect(state.decisive).toBe(true);
    recordElimination(state, "red");
    expect(advanceElimination(state, 59_000, { aliveByTeam: { red: 1, blue: 0 }, healthRatioByTeam: { red: 0.5, blue: 0 } })).toEqual([{ type: "match-won", winnerTeamId: "red", reason: "decisive" }]);
    expect(resetEliminationRound(state, 59_000)).toMatchObject({ phase: "prep", roundIndex: 2, deadline: 67_000, decisive: false });
  });
});
