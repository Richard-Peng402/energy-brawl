import type { TeamId } from "./mode-catalog";

export type EliminationTeamId = Extract<TeamId, "red" | "blue">;
export type EliminationPhase = "prep" | "live" | "overtime" | "result" | "decisive";

export interface EliminationRules {
  maxScoredRounds: number;
  prepMs: number;
  liveMs: number;
  overtimeMs: number;
  decisiveMs: number;
}

export const DEFAULT_ELIMINATION_RULES: Readonly<EliminationRules> = {
  maxScoredRounds: 7,
  prepMs: 8_000,
  liveMs: 40_000,
  overtimeMs: 10_000,
  decisiveMs: 30_000,
};

export interface EliminationScore {
  red: number;
  blue: number;
}

export interface EliminationWorldView {
  aliveByTeam: Readonly<Record<EliminationTeamId, number>>;
  healthRatioByTeam: Readonly<Record<EliminationTeamId, number>>;
}

export interface RoundResolutionInput extends EliminationWorldView {
  timedOut: boolean;
  decisive: boolean;
  firstEliminationTeamId?: EliminationTeamId | null;
  forcedWinnerTeamId?: EliminationTeamId | null;
}

export interface EliminationResolution {
  kind: "round" | "match";
  winnerTeamId: EliminationTeamId | null;
  reason: "eliminated" | "timeout" | "decisive" | "forced" | "draw";
}

export interface MatchResolutionInput {
  roundScores: Readonly<EliminationScore>;
  maxScoredRounds: number;
  decisiveWinner?: EliminationTeamId | null;
}

export function resolveEliminationRound(input: RoundResolutionInput): EliminationResolution {
  if (input.forcedWinnerTeamId) return { kind: "round", winnerTeamId: input.forcedWinnerTeamId, reason: "forced" };
  if (input.decisive && input.firstEliminationTeamId) {
    return { kind: "round", winnerTeamId: input.firstEliminationTeamId, reason: "decisive" };
  }

  const redAlive = input.aliveByTeam.red;
  const blueAlive = input.aliveByTeam.blue;
  if (redAlive > 0 && blueAlive === 0) return { kind: "round", winnerTeamId: "red", reason: "eliminated" };
  if (blueAlive > 0 && redAlive === 0) return { kind: "round", winnerTeamId: "blue", reason: "eliminated" };
  if (!input.timedOut) return { kind: "round", winnerTeamId: null, reason: "draw" };
  if (redAlive !== blueAlive) return { kind: "round", winnerTeamId: redAlive > blueAlive ? "red" : "blue", reason: "timeout" };
  if (input.healthRatioByTeam.red !== input.healthRatioByTeam.blue) {
    return { kind: "round", winnerTeamId: input.healthRatioByTeam.red > input.healthRatioByTeam.blue ? "red" : "blue", reason: "timeout" };
  }
  return { kind: "round", winnerTeamId: null, reason: "draw" };
}

export function resolveEliminationMatch(input: MatchResolutionInput): EliminationResolution {
  const target = Math.floor(input.maxScoredRounds / 2) + 1;
  if (input.roundScores.red >= target && input.roundScores.red > input.roundScores.blue) {
    return { kind: "match", winnerTeamId: "red", reason: "eliminated" };
  }
  if (input.roundScores.blue >= target && input.roundScores.blue > input.roundScores.red) {
    return { kind: "match", winnerTeamId: "blue", reason: "eliminated" };
  }
  if (input.roundScores.red === input.roundScores.blue && input.decisiveWinner) {
    return { kind: "match", winnerTeamId: input.decisiveWinner, reason: "decisive" };
  }
  return { kind: "match", winnerTeamId: null, reason: "draw" };
}
