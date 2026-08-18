import {
  DEFAULT_ELIMINATION_RULES,
  resolveEliminationMatch,
  resolveEliminationRound,
  type EliminationPhase,
  type EliminationResolution,
  type EliminationRules,
  type EliminationScore,
  type EliminationTeamId,
  type EliminationWorldView,
} from "../shared/team-elimination";

export interface EliminationRoundSummary {
  roundIndex: number;
  winnerTeamId: EliminationTeamId | null;
  reason: EliminationResolution["reason"];
  redAlive: number;
  blueAlive: number;
}

export interface EliminationState {
  rules: EliminationRules;
  phase: EliminationPhase;
  roundIndex: number;
  scores: EliminationScore;
  deadline: number;
  decisive: boolean;
  firstEliminationTeamId: EliminationTeamId | null;
  rounds: EliminationRoundSummary[];
}

export type EliminationTransition =
  | { type: "phase"; phase: Exclude<EliminationPhase, "result"> }
  | { type: "round-won"; winnerTeamId: EliminationTeamId; reason: EliminationResolution["reason"] }
  | { type: "match-won"; winnerTeamId: EliminationTeamId; reason: EliminationResolution["reason"] };

export function createEliminationState(now: number, overrides: Partial<EliminationRules> = {}): EliminationState {
  const rules = { ...DEFAULT_ELIMINATION_RULES, ...overrides };
  return {
    rules,
    phase: "prep",
    roundIndex: 1,
    scores: { red: 0, blue: 0 },
    deadline: now + rules.prepMs,
    decisive: false,
    firstEliminationTeamId: null,
    rounds: [],
  };
}

export function recordElimination(state: EliminationState, teamId: EliminationTeamId): void {
  if (state.phase !== "decisive") return;
  state.firstEliminationTeamId ??= teamId;
}

export function advanceElimination(state: EliminationState, now: number, view: EliminationWorldView): EliminationTransition[] {
  const transitions: EliminationTransition[] = [];
  if (state.phase === "prep" && now >= state.deadline) {
    state.phase = "live";
    state.deadline = now + state.rules.liveMs;
    transitions.push({ type: "phase", phase: "live" });
  }

  if (state.phase === "live") {
    const resolution = resolveEliminationRound({
      ...view,
      timedOut: now >= state.deadline,
      decisive: false,
    });
    if (resolution.winnerTeamId) return finishRound(state, now, view, resolution, transitions);
    if (now >= state.deadline) {
      state.phase = "overtime";
      state.deadline = now + state.rules.overtimeMs;
      transitions.push({ type: "phase", phase: "overtime" });
    }
    return transitions;
  }

  if (state.phase === "overtime" && now >= state.deadline) {
    const resolution = resolveEliminationRound({ ...view, timedOut: true, decisive: false });
    if (resolution.winnerTeamId) return finishRound(state, now, view, resolution, transitions);
    state.phase = "decisive";
    state.decisive = true;
    state.firstEliminationTeamId = null;
    state.deadline = now + state.rules.decisiveMs;
    transitions.push({ type: "phase", phase: "decisive" });
    return transitions;
  }

  if (state.phase === "decisive") {
    const resolution = resolveEliminationRound({
      ...view,
      timedOut: now >= state.deadline,
      decisive: true,
      firstEliminationTeamId: state.firstEliminationTeamId,
    });
    if (resolution.winnerTeamId) return finishRound(state, now, view, resolution, transitions);
    if (now >= state.deadline) {
      const fallbackWinner = view.healthRatioByTeam.red >= view.healthRatioByTeam.blue ? "red" : "blue";
      return finishRound(state, now, view, { kind: "round", winnerTeamId: fallbackWinner, reason: "decisive" }, transitions);
    }
  }
  return transitions;
}

export function resetEliminationRound(state: EliminationState, now: number): EliminationState {
  if (state.phase !== "result") return state;
  state.roundIndex += 1;
  state.phase = "prep";
  state.deadline = now + state.rules.prepMs;
  state.decisive = false;
  state.firstEliminationTeamId = null;
  return state;
}

function finishRound(
  state: EliminationState,
  now: number,
  view: EliminationWorldView,
  resolution: EliminationResolution,
  transitions: EliminationTransition[],
): EliminationTransition[] {
  const winner = resolution.winnerTeamId;
  if (!winner) return transitions;
  state.rounds.push({
    roundIndex: state.roundIndex,
    winnerTeamId: winner,
    reason: resolution.reason,
    redAlive: view.aliveByTeam.red,
    blueAlive: view.aliveByTeam.blue,
  });
  if (!state.decisive) state.scores[winner] += 1;

  const matchResolution = resolveEliminationMatch({
    roundScores: state.scores,
    maxScoredRounds: state.rules.maxScoredRounds,
    decisiveWinner: state.decisive ? winner : null,
  });
  state.phase = "result";
  state.deadline = now + 1_000;
  if (matchResolution.winnerTeamId) {
    transitions.push({ type: "match-won", winnerTeamId: matchResolution.winnerTeamId, reason: matchResolution.reason });
  } else {
    transitions.push({ type: "round-won", winnerTeamId: winner, reason: resolution.reason });
  }
  return transitions;
}
