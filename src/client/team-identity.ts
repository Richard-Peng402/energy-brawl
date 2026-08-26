import type { MatchMode, TeamId } from "../shared/mode-catalog";

export type TeamIdentityRelation = "local" | "teammate" | "enemy" | "neutral";
export type TeamIdentityMarker = "diamond" | "chevron" | "dot";

export interface TeamIdentityInput {
  matchMode: MatchMode;
  playerTeamId?: TeamId | null;
  localTeamId?: TeamId | null;
  isLocal: boolean;
  isBot: boolean;
}

export interface TeamIdentityVisual {
  relation: TeamIdentityRelation;
  marker: TeamIdentityMarker;
  label: string;
  ringWidth: number;
  ringAlpha: number;
  directionIndicator: boolean;
  badge: "AI" | null;
}

/**
 * Provides non-colour identity cues so team information stays readable on
 * small screens and remains accessible when player colours are similar.
 */
export function resolveTeamIdentityVisual(input: TeamIdentityInput): TeamIdentityVisual {
  const teamMode = input.matchMode !== "solo";
  const relation: TeamIdentityRelation = input.isLocal
    ? "local"
    : !teamMode || !input.playerTeamId || !input.localTeamId
      ? "neutral"
      : input.playerTeamId === input.localTeamId
        ? "teammate"
        : "enemy";

  if (relation === "teammate") {
    return {
      relation,
      marker: "diamond",
      label: teamLabel(input.playerTeamId),
      ringWidth: 7,
      ringAlpha: 0.92,
      directionIndicator: true,
      badge: input.isBot ? "AI" : null,
    };
  }
  if (relation === "enemy") {
    return {
      relation,
      marker: "chevron",
      label: "敌方",
      ringWidth: 4,
      ringAlpha: 0.72,
      directionIndicator: false,
      badge: input.isBot ? "AI" : null,
    };
  }
  return {
    relation,
    marker: "dot",
    label: relation === "local" ? "" : "",
    ringWidth: relation === "local" ? 6 : 3,
    ringAlpha: relation === "local" ? 1 : 0.62,
    directionIndicator: false,
    badge: input.isBot ? "AI" : null,
  };
}

function teamLabel(teamId: TeamId | null | undefined): string {
  if (teamId === "red") return "红队";
  if (teamId === "blue") return "蓝队";
  if (teamId === "gold") return "金队";
  return "";
}
