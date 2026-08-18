import type { GameSnapshot, PlayerSnapshot } from "../shared/protocol";

export interface EliminationHudView {
  visible: boolean;
  scoreLabel: string;
  roundLabel: string;
  phaseLabel: string;
  countdownLabel: string;
  aliveLabel: string;
}

export interface EliminationSpectatorView {
  visible: boolean;
  targetName: string | null;
}

export interface EliminationRoundResultView {
  visible: boolean;
  text: string;
}

export interface EliminationRoundHistoryItem {
  roundIndex: number;
  winnerLabel: string;
  reasonLabel: string;
  scoreLabel: string;
}

const PHASE_LABELS = {
  prep: "准备",
  live: "战斗",
  overtime: "加时",
  decisive: "决胜",
  result: "回合结算",
} as const;

const REASON_LABELS = {
  eliminated: "全灭",
  timeout: "时间到",
  decisive: "决胜击杀",
  forced: "房主裁定",
  draw: "平局",
} as const;

export function buildEliminationHud(snapshot: GameSnapshot, playerId: string | null): EliminationHudView {
  const elimination = snapshot.elimination;
  if (snapshot.matchMode !== "teamElimination3v3" || !elimination) {
    return { visible: false, scoreLabel: "", roundLabel: "", phaseLabel: "", countdownLabel: "", aliveLabel: "" };
  }
  const red = elimination.roundScores.find((team) => team.teamId === "red");
  const blue = elimination.roundScores.find((team) => team.teamId === "blue");
  const redAlive = aliveCount(snapshot.players, "red");
  const blueAlive = aliveCount(snapshot.players, "blue");
  return {
    visible: true,
    scoreLabel: `红队 ${red?.score ?? 0} : ${blue?.score ?? 0} 蓝队`,
    roundLabel: `第 ${elimination.roundIndex} / ${elimination.maxScoredRounds} 回合`,
    phaseLabel: PHASE_LABELS[elimination.phase],
    countdownLabel: `${Math.ceil(Math.max(0, elimination.deadline - snapshot.serverTime) / 1_000)}s`,
    aliveLabel: `存活 ${redAlive} - ${blueAlive}`,
  };
}

export function buildEliminationSpectator(snapshot: GameSnapshot, playerId: string | null): EliminationSpectatorView {
  const elimination = snapshot.elimination;
  const own = snapshot.players.find((player) => player.id === playerId);
  if (snapshot.matchMode !== "teamElimination3v3" || !elimination || !own || own.alive || elimination.phase === "result") {
    return { visible: false, targetName: null };
  }
  const target = snapshot.players.find((player) => player.id !== own.id && player.alive && player.teamId === own.teamId);
  return { visible: true, targetName: target?.nickname ?? null };
}

export function buildEliminationRoundResult(snapshot: GameSnapshot): EliminationRoundResultView {
  const elimination = snapshot.elimination;
  const round = elimination?.rounds.at(-1);
  if (snapshot.matchMode !== "teamElimination3v3" || !elimination || elimination.phase !== "result" || !round) {
    return { visible: false, text: "" };
  }
  const winner = round.winnerTeamId === "red" ? "红队" : round.winnerTeamId === "blue" ? "蓝队" : "平局";
  return { visible: true, text: `第 ${round.roundIndex} 回合：${winner}获胜 · ${REASON_LABELS[round.reason]}` };
}

export function buildEliminationRoundHistory(snapshot: GameSnapshot): EliminationRoundHistoryItem[] {
  const elimination = snapshot.elimination;
  if (snapshot.matchMode !== "teamElimination3v3" || !elimination) return [];
  return elimination.rounds.map((round) => ({
    roundIndex: round.roundIndex,
    winnerLabel: round.winnerTeamId === "red" ? "红队" : round.winnerTeamId === "blue" ? "蓝队" : "平局",
    reasonLabel: REASON_LABELS[round.reason],
    scoreLabel: `存活 ${round.redAlive} - ${round.blueAlive}`,
  }));
}

function aliveCount(players: readonly PlayerSnapshot[], teamId: "red" | "blue"): number {
  return players.filter((player) => player.teamId === teamId && player.alive).length;
}
