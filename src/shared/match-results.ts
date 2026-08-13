import type { PlayerSnapshot } from "./protocol";

export interface MatchMvpResult {
  playerId: string | null;
  score: number | null;
}

export function calculateMvpScore(player: PlayerSnapshot): number {
  return Math.round(
    player.kills * 250
    + (player.assists ?? 0) * 110
    + player.score * 55
    + (player.damageDealt ?? 0)
    + (player.healingDone ?? 0) * 1.15
    + (player.damageTaken ?? 0) * 0.25
    + (player.skillContribution ?? 0) * 70
    - (player.deaths ?? 0) * 90,
  );
}

export function selectMatchMvp(players: readonly PlayerSnapshot[]): MatchMvpResult {
  const ranked = players.map((player) => ({ player, score: calculateMvpScore(player) })).sort((left, right) =>
    right.score - left.score
    || (left.player.deaths ?? 0) - (right.player.deaths ?? 0)
    || (right.player.assists ?? 0) - (left.player.assists ?? 0)
    || left.player.id.localeCompare(right.player.id),
  );
  const best = ranked[0];
  return best ? { playerId: best.player.id, score: best.score } : { playerId: null, score: null };
}
