import type { MapMechanicContribution, PlayerSnapshot } from "./protocol";

export interface MatchMvpResult {
  playerId: string | null;
  score: number | null;
}

const EMPTY_MAP_MECHANIC_CONTRIBUTION: Readonly<MapMechanicContribution> = {
  reactorEscapes: 0,
  neonDamage: 0,
  crystalResonances: 0,
  mechanicHealing: 0,
  mechanicEliminations: 0,
};

function contributionValue(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateMapMechanicContributionScore(
  contribution: MapMechanicContribution | null | undefined,
): number {
  const value = contribution ?? EMPTY_MAP_MECHANIC_CONTRIBUTION;
  return Math.round(
    contributionValue(value.reactorEscapes) * 40
    + contributionValue(value.neonDamage) * 0.25
    + contributionValue(value.crystalResonances) * 45
    + contributionValue(value.mechanicHealing) * 1.25
    + contributionValue(value.mechanicEliminations) * 100,
  );
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
    + calculateMapMechanicContributionScore(player.mapMechanicContribution)
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
