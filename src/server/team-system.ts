import type { CharacterId } from "../shared/character-catalog";
import { getModeDefinition, TEAM_IDS, type MatchMode, type TeamId } from "../shared/mode-catalog";

export interface TeamAssignableSeat {
  id: string;
  characterId: CharacterId;
  isBot: boolean;
  teamId: TeamId | null;
}

export function teamIdsForMode(mode: MatchMode): TeamId[] {
  return TEAM_IDS.slice(0, getModeDefinition(mode).teamCount);
}

export function assignBalancedTeams<T extends TeamAssignableSeat>(seats: T[], mode: MatchMode): T[] {
  const teamIds = teamIdsForMode(mode);
  if (teamIds.length === 0) {
    for (const seat of seats) seat.teamId = null;
    return seats;
  }

  const ordered = [...seats.filter((seat) => !seat.isBot), ...seats.filter((seat) => seat.isBot)];
  ordered.forEach((seat, index) => {
    seat.teamId = teamIds[index % teamIds.length] ?? null;
  });
  return seats;
}

export function swapTeams<T extends TeamAssignableSeat>(seats: T[], firstId: string, secondId: string): boolean {
  if (firstId === secondId) return false;
  const first = seats.find((seat) => seat.id === firstId);
  const second = seats.find((seat) => seat.id === secondId);
  if (!first || !second || !first.teamId || !second.teamId || first.teamId === second.teamId) return false;
  [first.teamId, second.teamId] = [second.teamId, first.teamId];
  return true;
}

export function teamSizes(seats: readonly TeamAssignableSeat[]): Partial<Record<TeamId, number>> {
  const result: Partial<Record<TeamId, number>> = {};
  for (const seat of seats) {
    if (seat.teamId) result[seat.teamId] = (result[seat.teamId] ?? 0) + 1;
  }
  return result;
}

export function hasDuplicateCharacterOnTeam(seats: readonly TeamAssignableSeat[]): boolean {
  const seen = new Set<string>();
  for (const seat of seats) {
    if (!seat.teamId) continue;
    const key = `${seat.teamId}:${seat.characterId}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
