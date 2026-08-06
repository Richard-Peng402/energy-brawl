import type { GameSnapshot, RoomSnapshot } from "../shared/protocol";

export function roomUiRevision(room: RoomSnapshot | null): string {
  if (!room) return "empty";
  const players = room.players
    .map((player) => [player.id, player.nickname, player.characterId, player.isBot, player.connected, player.ready].join(":"))
    .join(";");
  return [room.phase, room.canStart, room.pendingWinnerId ?? "", players].join("|");
}

export function gameLeaderboardRevision(snapshot: GameSnapshot, localPlayerId: string | null): string {
  return [...snapshot.players]
    .sort((left, right) => right.score - left.score || right.kills - left.kills || left.id.localeCompare(right.id))
    .slice(0, 4)
    .map((player) => [player.id, player.nickname, player.color, player.score, player.kills, player.id === localPlayerId].join(":"))
    .join(";");
}
