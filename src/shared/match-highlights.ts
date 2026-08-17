import type { TeamId } from "./mode-catalog";
import type { MapMechanicKind } from "./map-mechanics";

export type MatchHighlightKind = "five-kill-streak" | "critical-healing" | "capture-comeback" | "hazard-escape";

export interface MatchHighlight {
  kind: MatchHighlightKind;
  playerId: string;
  playerName: string;
  value: number;
  occurredAt: number;
  targetPlayerId?: string;
  targetPlayerName?: string;
  teamId?: TeamId;
  mechanicKind?: MapMechanicKind;
}

export const MATCH_HIGHLIGHT_PRIORITY: Readonly<Record<MatchHighlightKind, number>> = {
  "five-kill-streak": 0,
  "capture-comeback": 1,
  "critical-healing": 2,
  "hazard-escape": 3,
};
