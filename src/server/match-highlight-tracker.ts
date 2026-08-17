import type { TeamId } from "../shared/mode-catalog";
import type { MapMechanicKind } from "../shared/map-mechanics";
import {
  MATCH_HIGHLIGHT_PRIORITY,
  type MatchHighlight,
  type MatchHighlightKind,
} from "../shared/match-highlights";

interface HighlightCandidate {
  kind: MatchHighlightKind;
  playerId: string;
  value: number;
  occurredAt: number;
  targetPlayerId?: string;
  teamId?: TeamId;
  mechanicKind?: MapMechanicKind;
}

interface PendingHealingCandidate {
  healerId: string;
  targetId: string;
  startedAt: number;
  lastAt: number;
  amount: number;
  confirmAt: number;
}

interface CaptureComebackState {
  eligible: boolean;
  maxDeficit: number;
  tookLeadAt: number | null;
  contributions: Map<string, number>;
}

export interface MatchHighlightTracker {
  bestByKind: Map<MatchHighlightKind, HighlightCandidate>;
  pendingHealing: PendingHealingCandidate[];
  captureByTeam: Map<TeamId, CaptureComebackState>;
}

export interface HealingCandidateInput {
  healerId: string;
  targetId: string;
  beforeHealthRatio: number;
  amount: number;
  at: number;
}

export interface CaptureScoreInput {
  at: number;
  targetScore: number;
  scores: Partial<Record<TeamId, number>>;
  scoringTeamId: TeamId;
  scoreDelta: number;
  contributorIds: readonly string[];
}

export interface HighlightFinalizationSnapshot {
  winnerIds: readonly string[];
  players: readonly { id: string; nickname: string; teamId?: TeamId | null }[];
}

const HEALING_THRESHOLD = 18;
const HEALING_WINDOW_MS = 1_000;
const HEALING_SURVIVAL_MS = 4_000;
const CRITICAL_HEALTH_RATIO = 0.25;
const MAX_PENDING_HEALING = 6;

export function createMatchHighlightTracker(): MatchHighlightTracker {
  return {
    bestByKind: new Map(),
    pendingHealing: [],
    captureByTeam: new Map(),
  };
}

export function recordFiveKillStreak(tracker: MatchHighlightTracker, playerId: string, at: number, streak: number): void {
  if (streak < 5 || !Number.isFinite(at)) return;
  const current = tracker.bestByKind.get("five-kill-streak");
  if (!current || at < current.occurredAt) {
    tracker.bestByKind.set("five-kill-streak", { kind: "five-kill-streak", playerId, value: streak, occurredAt: at });
  } else if (current.playerId === playerId) {
    current.value = Math.max(current.value, streak);
  }
}

export function recordHealingCandidate(tracker: MatchHighlightTracker, input: HealingCandidateInput): void {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isFinite(input.at)) return;
  const existing = tracker.pendingHealing.find((candidate) =>
    candidate.healerId === input.healerId
    && candidate.targetId === input.targetId
    && input.at - candidate.lastAt <= HEALING_WINDOW_MS,
  );
  if (existing) {
    existing.amount += input.amount;
    existing.lastAt = input.at;
    existing.confirmAt = input.at + HEALING_SURVIVAL_MS;
    return;
  }
  if (input.beforeHealthRatio > CRITICAL_HEALTH_RATIO) return;
  tracker.pendingHealing.push({
    healerId: input.healerId,
    targetId: input.targetId,
    startedAt: input.at,
    lastAt: input.at,
    amount: input.amount,
    confirmAt: input.at + HEALING_SURVIVAL_MS,
  });
  if (tracker.pendingHealing.length > MAX_PENDING_HEALING) tracker.pendingHealing.splice(0, tracker.pendingHealing.length - MAX_PENDING_HEALING);
}

export function advanceHighlightTracker(tracker: MatchHighlightTracker, now: number, alivePlayerIds: readonly string[]): void {
  const alive = new Set(alivePlayerIds);
  tracker.pendingHealing = tracker.pendingHealing.filter((candidate) => {
    if (!alive.has(candidate.targetId)) return false;
    if (candidate.amount < HEALING_THRESHOLD && now - candidate.lastAt > HEALING_WINDOW_MS) return false;
    if (candidate.amount < HEALING_THRESHOLD || now < candidate.confirmAt) return true;
    setBestCandidate(tracker, {
      kind: "critical-healing",
      playerId: candidate.healerId,
      targetPlayerId: candidate.targetId,
      value: Math.round(candidate.amount),
      occurredAt: candidate.startedAt,
    });
    return false;
  });
}

export function recordHazardEscape(
  tracker: MatchHighlightTracker,
  playerId: string,
  at: number,
  mechanicKind: MapMechanicKind,
): void {
  setBestCandidate(tracker, {
    kind: "hazard-escape",
    playerId,
    value: 1,
    occurredAt: at,
    mechanicKind,
  });
}

export function recordCaptureScore(tracker: MatchHighlightTracker, input: CaptureScoreInput): void {
  const targetScore = Math.max(1, input.targetScore);
  const teamEntries = Object.entries(input.scores) as Array<[TeamId, number]>;
  for (const [teamId, score] of teamEntries) {
    const highestOpponent = Math.max(0, ...teamEntries.filter(([candidate]) => candidate !== teamId).map(([, value]) => value));
    const deficit = Math.max(0, highestOpponent - score);
    const state = captureState(tracker, teamId);
    state.maxDeficit = Math.max(state.maxDeficit, deficit);
    if (deficit >= targetScore * 0.2) state.eligible = true;
  }

  const scoringState = captureState(tracker, input.scoringTeamId);
  if (scoringState.eligible && input.scoreDelta > 0 && input.contributorIds.length > 0) {
    const share = input.scoreDelta / input.contributorIds.length;
    for (const playerId of input.contributorIds) {
      scoringState.contributions.set(playerId, (scoringState.contributions.get(playerId) ?? 0) + share);
    }
  }
  const ownScore = input.scores[input.scoringTeamId] ?? 0;
  const highestOpponent = Math.max(0, ...teamEntries.filter(([teamId]) => teamId !== input.scoringTeamId).map(([, score]) => score));
  if (scoringState.eligible && ownScore > highestOpponent && scoringState.tookLeadAt === null) scoringState.tookLeadAt = input.at;
}

export function finalizeMatchHighlights(
  tracker: MatchHighlightTracker,
  snapshot: HighlightFinalizationSnapshot,
): MatchHighlight[] {
  const players = new Map(snapshot.players.map((player) => [player.id, player] as const));
  const winnerTeamId = snapshot.winnerIds
    .map((playerId) => players.get(playerId)?.teamId ?? null)
    .find((teamId): teamId is TeamId => teamId !== null) ?? null;
  if (winnerTeamId) {
    const capture = tracker.captureByTeam.get(winnerTeamId);
    if (capture?.eligible && capture.tookLeadAt !== null && capture.contributions.size > 0) {
      const [playerId] = [...capture.contributions].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]!;
      setBestCandidate(tracker, {
        kind: "capture-comeback",
        playerId,
        value: Math.round(capture.maxDeficit),
        occurredAt: capture.tookLeadAt,
        teamId: winnerTeamId,
      });
    }
  }

  return [...tracker.bestByKind.values()]
    .sort((left, right) => MATCH_HIGHLIGHT_PRIORITY[left.kind] - MATCH_HIGHLIGHT_PRIORITY[right.kind] || left.occurredAt - right.occurredAt || left.playerId.localeCompare(right.playerId))
    .slice(0, 4)
    .flatMap((candidate) => {
      const player = players.get(candidate.playerId);
      if (!player) return [];
      const target = candidate.targetPlayerId ? players.get(candidate.targetPlayerId) : undefined;
      return [{
        ...candidate,
        playerName: player.nickname,
        ...(target ? { targetPlayerName: target.nickname } : {}),
      } satisfies MatchHighlight];
    });
}

function captureState(tracker: MatchHighlightTracker, teamId: TeamId): CaptureComebackState {
  let state = tracker.captureByTeam.get(teamId);
  if (!state) {
    state = { eligible: false, maxDeficit: 0, tookLeadAt: null, contributions: new Map() };
    tracker.captureByTeam.set(teamId, state);
  }
  return state;
}

function setBestCandidate(tracker: MatchHighlightTracker, candidate: HighlightCandidate): void {
  const current = tracker.bestByKind.get(candidate.kind);
  if (!current || candidate.value > current.value || (candidate.value === current.value && candidate.occurredAt < current.occurredAt)) {
    tracker.bestByKind.set(candidate.kind, candidate);
  }
}
