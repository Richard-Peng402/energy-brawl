import type { GameSnapshot, RoomSnapshot } from "../shared/protocol";

export function roomUiRevision(room: RoomSnapshot | null): string {
  if (!room) return "empty";
  const players = room.players
    .map((player) => [player.id, player.nickname, player.characterId, player.tacticalModuleId ?? "", player.isBot, player.connected, player.ready, player.teamId ?? ""].join(":"))
    .join(";");
  return [
    room.phase,
    room.lifecyclePhase ?? "lobby",
    room.countdownRemainingMs ?? "",
    room.canStart,
    room.pendingWinnerId ?? "",
    room.mapSelection ?? "reactor-core",
    room.mapMechanicsEnabled ?? true,
    room.mapEventsEnabled ?? true,
    players,
  ].join("|");
}

export function gameLeaderboardRevision(snapshot: GameSnapshot, localPlayerId: string | null): string {
  return [...snapshot.players]
    .sort((left, right) => right.score - left.score || right.kills - left.kills || left.id.localeCompare(right.id))
    .slice(0, 4)
    .map((player) => [player.id, player.nickname, player.color, player.score, player.kills, player.teamId ?? "", player.id === localPlayerId].join(":"))
    .join(";");
}

export function capturePointRevision(snapshot: GameSnapshot): string {
  const point = snapshot.capturePoint;
  if (!point) return "solo";
  return [point.state, point.ownerTeamId ?? "", point.progress.toFixed(1), point.contestingTeams.join(",")].join(":");
}
