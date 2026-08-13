import type { TeamId } from "./mode-catalog";

export const CAPTURE_POINT_STATES = ["neutral", "capturing", "owned", "contested"] as const;
export type CapturePointStateName = typeof CAPTURE_POINT_STATES[number];

export interface CapturePointConfig {
  center: { x: number; y: number };
  radius: number;
  targetProgress: number;
  ratePerSecond: number;
}

export interface CapturePointState {
  ownerTeamId: TeamId | null;
  progress: number;
  contestingTeams: TeamId[];
  state: CapturePointStateName;
}

export interface CapturePointPlayer {
  x: number;
  y: number;
  alive: boolean;
  teamId?: TeamId | null;
}

export const DEFAULT_CAPTURE_POINT_CONFIG: Readonly<CapturePointConfig> = {
  center: { x: 1_440, y: 810 },
  radius: 220,
  targetProgress: 100,
  ratePerSecond: 1.5,
};

export function createCapturePointState(): CapturePointState {
  return { ownerTeamId: null, progress: 0, contestingTeams: [], state: "neutral" };
}

export function advanceCapturePoint(
  current: CapturePointState,
  players: readonly CapturePointPlayer[],
  deltaMs: number,
  config: CapturePointConfig = DEFAULT_CAPTURE_POINT_CONFIG,
): CapturePointState {
  const teams = [...new Set(players
    .filter((player) => player.alive && player.teamId)
    .filter((player) => Math.hypot(player.x - config.center.x, player.y - config.center.y) <= config.radius)
    .map((player) => player.teamId as TeamId))];
  const next: CapturePointState = { ...current, contestingTeams: teams };
  if (teams.length === 0) {
    next.state = current.ownerTeamId && current.progress >= config.targetProgress ? "owned" : current.ownerTeamId ? "capturing" : "neutral";
    return next;
  }
  if (teams.length > 1) {
    next.state = "contested";
    return next;
  }

  const teamId = teams[0]!;
  const delta = Math.max(0, deltaMs) / 1_000 * config.ratePerSecond;
  if (current.ownerTeamId && current.ownerTeamId !== teamId) {
    next.progress = Math.max(0, current.progress - delta);
    if (next.progress === 0) {
      next.ownerTeamId = null;
      next.state = "neutral";
      return next;
    }
    next.state = "capturing";
    return next;
  } else {
    next.ownerTeamId = teamId;
    next.progress = Math.min(config.targetProgress, current.progress + delta);
  }
  next.state = next.ownerTeamId === teamId && next.progress >= config.targetProgress ? "owned" : "capturing";
  return next;
}

export function isCapturePointComplete(score: number, config: CapturePointConfig = DEFAULT_CAPTURE_POINT_CONFIG): boolean {
  return Number.isFinite(score) && score >= config.targetProgress;
}
