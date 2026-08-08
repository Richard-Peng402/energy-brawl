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

  const teamSize = getModeDefinition(mode).teamSize;
  const counts = new Map<TeamId, number>(teamIds.map((teamId) => [teamId, 0]));
  const usedCharacters = new Map<TeamId, Set<CharacterId>>(teamIds.map((teamId) => [teamId, new Set()]));
  const ordered = [...seats.filter((seat) => !seat.isBot), ...seats.filter((seat) => seat.isBot)];

  for (const seat of ordered) {
    if (seat.teamId === null || !teamIds.includes(seat.teamId) || (counts.get(seat.teamId) ?? 0) >= teamSize) {
      seat.teamId = null;
      continue;
    }
    counts.set(seat.teamId, (counts.get(seat.teamId) ?? 0) + 1);
    usedCharacters.get(seat.teamId)?.add(seat.characterId);
  }

  for (const seat of ordered) {
    if (seat.teamId !== null) continue;
    const available = teamIds.filter((teamId) => (counts.get(teamId) ?? 0) < teamSize);
    const roleSafe = available.filter((teamId) => !usedCharacters.get(teamId)?.has(seat.characterId));
    const candidates = roleSafe.length > 0 ? roleSafe : available;
    const teamId = candidates.sort((left, right) => (counts.get(left) ?? 0) - (counts.get(right) ?? 0) || teamIds.indexOf(left) - teamIds.indexOf(right))[0] ?? null;
    seat.teamId = teamId;
    if (teamId) {
      counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
      usedCharacters.get(teamId)?.add(seat.characterId);
    }
  }
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
