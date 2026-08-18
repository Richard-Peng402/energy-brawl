import { getMapDefinition, type MapId } from "../shared/map-catalog";
import {
  MAP_EVENT_DEFINITIONS,
  getMapEventDefinition,
  type MapEventKind,
  type MapEventPhase,
  type MapEventSnapshot,
  type MapEventZone,
} from "../shared/map-events";
import type { Vec2 } from "../shared/protocol";

const FIRST_EVENT_DELAY_MS = 45_000;
const MECHANIC_DEFER_MS = 3_000;
const SUPPLY_CAPTURE_MS = 1_000;
const MAX_TRANSITIONS_PER_ADVANCE = 1_024;

export interface MapEventAdvanceOptions {
  mapMechanicBusy: boolean;
  allowNewEvent: boolean;
  maxEvents?: number;
}

export interface MapEventState {
  mapId: MapId;
  phase: MapEventPhase;
  kind: MapEventKind;
  kindIndex: number;
  round: number;
  eventSeq: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  now: number;
  zone: MapEventZone | null;
  point: Vec2 | null;
  participantStartedAt: Map<string, number>;
  claimedPlayerIds: Set<string>;
  revealedPlayerIds: Set<string>;
  graceUntilByPlayer: Map<string, number>;
  damageAtByPlayer: Map<string, number>;
}

export function createMapEventState(mapId: MapId, now: number, enabled: boolean, seed: number): MapEventState | null {
  if (!enabled) return null;
  const kindIndex = Math.abs(Math.trunc(seed)) % MAP_EVENT_DEFINITIONS.length;
  const kind = MAP_EVENT_DEFINITIONS[kindIndex]!.kind;
  const geometry = selectGeometry(mapId, kind, 0);
  return {
    mapId,
    phase: "idle",
    kind,
    kindIndex,
    round: 0,
    eventSeq: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + FIRST_EVENT_DELAY_MS,
    now,
    ...geometry,
    participantStartedAt: new Map(),
    claimedPlayerIds: new Set(),
    revealedPlayerIds: new Set(),
    graceUntilByPlayer: new Map(),
    damageAtByPlayer: new Map(),
  };
}

export function advanceMapEventState(state: MapEventState, now: number, options: MapEventAdvanceOptions): void {
  state.now = Math.max(state.now, now);
  let transitions = 0;
  while (state.now >= state.phaseEndsAt && transitions < MAX_TRANSITIONS_PER_ADVANCE) {
    transitions += 1;
    const boundary = state.phaseEndsAt;
    if (state.phase === "idle") {
      if (!options.allowNewEvent || reachedEventLimit(state, options)) {
        clearRoundState(state);
        state.phaseEndsAt = Number.POSITIVE_INFINITY;
        break;
      }
      if (options.mapMechanicBusy) {
        state.phaseEndsAt = boundary + MECHANIC_DEFER_MS;
        break;
      }
      enterWarning(state, boundary);
      continue;
    }
    if (state.phase === "warning") {
      enterPhase(state, "active", boundary, getMapEventDefinition(state.kind).activeMs);
      continue;
    }
    if (state.phase === "active") {
      clearRoundState(state);
      enterPhase(state, "cooldown", boundary, getMapEventDefinition(state.kind).cooldownMs);
      continue;
    }
    if (!options.allowNewEvent || reachedEventLimit(state, options)) {
      clearRoundState(state);
      state.phase = "idle";
      state.phaseStartedAt = boundary;
      state.phaseEndsAt = Number.POSITIVE_INFINITY;
      break;
    }
    if (options.mapMechanicBusy) {
      state.phase = "idle";
      state.phaseStartedAt = boundary;
      state.phaseEndsAt = boundary + MECHANIC_DEFER_MS;
      break;
    }
    state.round += 1;
    state.kindIndex = (state.kindIndex + 1) % MAP_EVENT_DEFINITIONS.length;
    state.kind = MAP_EVENT_DEFINITIONS[state.kindIndex]!.kind;
    Object.assign(state, selectGeometry(state.mapId, state.kind, state.round));
    enterWarning(state, boundary);
  }
}

function reachedEventLimit(state: MapEventState, options: MapEventAdvanceOptions): boolean {
  return Number.isFinite(options.maxEvents) && state.eventSeq >= Math.max(0, Math.trunc(options.maxEvents ?? 0));
}

export function mapEventSnapshot(state: MapEventState): MapEventSnapshot {
  const participantIds = new Set([
    ...state.participantStartedAt.keys(),
    ...state.claimedPlayerIds,
    ...state.revealedPlayerIds,
    ...state.graceUntilByPlayer.keys(),
  ]);
  return {
    eventSeq: state.eventSeq,
    kind: state.kind,
    phase: state.phase,
    round: state.round,
    zone: state.zone ? { ...state.zone } : null,
    point: state.point ? { ...state.point } : null,
    phaseStartedAt: state.phaseStartedAt,
    phaseEndsAt: state.phaseEndsAt,
    participants: [...participantIds].sort().map((playerId) => {
      const startedAt = state.participantStartedAt.get(playerId);
      return {
        playerId,
        progress: startedAt === undefined ? undefined : Math.min(1, Math.max(0, (state.now - startedAt) / SUPPLY_CAPTURE_MS)),
        revealed: state.revealedPlayerIds.has(playerId) || undefined,
        graceUntil: state.graceUntilByPlayer.get(playerId),
      };
    }),
  };
}

function enterWarning(state: MapEventState, startedAt: number): void {
  state.eventSeq += 1;
  enterPhase(state, "warning", startedAt, getMapEventDefinition(state.kind).warningMs);
}

function enterPhase(state: MapEventState, phase: MapEventPhase, startedAt: number, durationMs: number): void {
  state.phase = phase;
  state.phaseStartedAt = startedAt;
  state.phaseEndsAt = startedAt + durationMs;
}

function clearRoundState(state: MapEventState): void {
  state.participantStartedAt.clear();
  state.claimedPlayerIds.clear();
  state.revealedPlayerIds.clear();
  state.graceUntilByPlayer.clear();
  state.damageAtByPlayer.clear();
}

function selectGeometry(mapId: MapId, kind: MapEventKind, round: number): { zone: MapEventZone | null; point: Vec2 | null } {
  const map = getMapDefinition(mapId);
  if (kind === "supply-drop") return { zone: null, point: map.eventSupplyPoints[round % map.eventSupplyPoints.length]! };
  if (kind === "area-lockdown") return { zone: map.eventLockdownZones[round % map.eventLockdownZones.length]!, point: null };
  if (kind === "energy-storm") return { zone: map.eventStormSafeZones[round % map.eventStormSafeZones.length]!, point: null };
  return { zone: null, point: null };
}
