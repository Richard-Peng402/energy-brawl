import type { TeamId } from "../shared/mode-catalog";
import type { ExclusiveSkillEvent } from "../shared/protocol";

export interface SelectedExclusiveSkillFeedback {
  events: ExclusiveSkillEvent[];
  lastSequence: number;
}

export type ExclusiveSkillRelationship = "local" | "ally" | "enemy";

export interface ExclusiveSkillFeedbackPlayer {
  id: string;
  teamId?: TeamId | null;
  x: number;
  y: number;
}

export interface ClassifiedExclusiveSkillFeedback {
  event: ExclusiveSkillEvent;
  relationship: ExclusiveSkillRelationship;
  sourcePosition: { x: number; y: number };
  distance: number | null;
}

export function selectExclusiveSkillFeedback(
  events: readonly ExclusiveSkillEvent[],
  lastSequence: number | null,
): SelectedExclusiveSkillFeedback {
  if (lastSequence === null) {
    return { events: [], lastSequence: events.at(-1)?.eventSeq ?? 0 };
  }
  const selected = events.filter((event) => event.eventSeq > lastSequence);
  return {
    events: selected.map((event) => ({
      ...event,
      origin: { ...event.origin },
      target: { ...event.target },
    })),
    lastSequence: selected.at(-1)?.eventSeq ?? lastSequence,
  };
}

export function classifyExclusiveSkillFeedback(
  event: ExclusiveSkillEvent,
  localPlayerId: string | null,
  players: readonly ExclusiveSkillFeedbackPlayer[],
): ClassifiedExclusiveSkillFeedback {
  const localPlayer = localPlayerId ? players.find((player) => player.id === localPlayerId) : undefined;
  const sourcePlayer = players.find((player) => player.id === event.playerId);
  const relationship: ExclusiveSkillRelationship = event.playerId === localPlayerId
    ? "local"
    : localPlayer?.teamId != null && sourcePlayer?.teamId === localPlayer.teamId
      ? "ally"
      : "enemy";
  const sourcePosition = { ...event.origin };
  return {
    event,
    relationship,
    sourcePosition,
    distance: localPlayer ? Math.hypot(sourcePosition.x - localPlayer.x, sourcePosition.y - localPlayer.y) : null,
  };
}
