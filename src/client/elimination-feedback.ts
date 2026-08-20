import type { GameSnapshot } from "../shared/protocol";

export type EliminationRoundOutcome = "win" | "loss";

export interface EliminationRoundFeedbackEvent {
  key: string;
  outcome: EliminationRoundOutcome;
  roundIndex: number;
}

export interface EliminationRoundFeedbackSelection {
  event: EliminationRoundFeedbackEvent | null;
  revision: string;
}

export function selectEliminationRoundFeedback(
  snapshot: GameSnapshot,
  playerId: string | null,
  previousRevision: string,
): EliminationRoundFeedbackSelection {
  const elimination = snapshot.elimination;
  if (snapshot.matchMode !== "teamElimination3v3" || !elimination) return { event: null, revision: "" };
  if (elimination.phase !== "result") return { event: null, revision: previousRevision };
  const round = elimination.rounds.at(-1);
  const teamId = snapshot.players.find((player) => player.id === playerId)?.teamId;
  if (!round || (teamId !== "red" && teamId !== "blue") || !round.winnerTeamId) {
    return { event: null, revision: previousRevision };
  }
  const revision = `${round.roundIndex}:${round.winnerTeamId}:${round.reason}:${elimination.deadline}`;
  if (revision === previousRevision) return { event: null, revision };
  const outcome: EliminationRoundOutcome = round.winnerTeamId === teamId ? "win" : "loss";
  return { event: { key: `elimination:${revision}:${outcome}`, outcome, roundIndex: round.roundIndex }, revision };
}
