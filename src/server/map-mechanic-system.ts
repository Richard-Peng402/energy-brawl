import type { MapId } from "../shared/map-catalog";
import {
  getMapMechanicDefinition,
  type MapMechanicDefinition,
  type MapMechanicPhase,
} from "../shared/map-mechanics";
import type { MapMechanicSnapshot } from "../shared/protocol";

const MAX_TRANSITIONS_PER_ADVANCE = 1_024;

export interface MapMechanicState {
  definition: MapMechanicDefinition;
  phase: MapMechanicPhase;
  round: number;
  zoneIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  now: number;
  participantChargeStartedAt: Map<string, number>;
  claimedPlayerIds: Set<string>;
  reactorDamageAt: Map<string, number>;
}

export function createMapMechanicState(mapId: MapId, now: number, enabled: boolean): MapMechanicState | null {
  if (!enabled) return null;
  const definition = getMapMechanicDefinition(mapId);
  return {
    definition,
    phase: "idle",
    round: 0,
    zoneIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + definition.firstWarningDelayMs,
    now,
    participantChargeStartedAt: new Map(),
    claimedPlayerIds: new Set(),
    reactorDamageAt: new Map(),
  };
}

export function advanceMapMechanicState(state: MapMechanicState, now: number, allowNewEvent: boolean): void {
  state.now = Math.max(state.now, now);
  let transitions = 0;
  while (state.now >= state.phaseEndsAt && transitions < MAX_TRANSITIONS_PER_ADVANCE) {
    transitions += 1;
    const boundary = state.phaseEndsAt;
    if (state.phase === "idle") {
      if (!allowNewEvent) {
        state.phaseEndsAt = Number.POSITIVE_INFINITY;
        break;
      }
      enterPhase(state, "warning", boundary, state.definition.warningMs);
      continue;
    }
    if (state.phase === "warning") {
      enterPhase(state, "active", boundary, state.definition.activeMs);
      continue;
    }
    if (state.phase === "active") {
      clearRoundState(state);
      enterPhase(state, "cooldown", boundary, state.definition.cooldownMs);
      continue;
    }
    if (!allowNewEvent) {
      state.phaseEndsAt = Number.POSITIVE_INFINITY;
      break;
    }
    state.round += 1;
    state.zoneIndex = state.round % state.definition.zones.length;
    enterPhase(state, "warning", boundary, state.definition.warningMs);
  }
}

export function updateCrystalParticipant(
  state: MapMechanicState,
  playerId: string,
  inside: boolean,
  now: number,
): boolean {
  state.now = Math.max(state.now, now);
  if (state.definition.kind !== "crystal-resonance" || state.phase !== "active") {
    state.participantChargeStartedAt.delete(playerId);
    return false;
  }
  if (state.claimedPlayerIds.has(playerId)) return false;
  if (!inside) {
    state.participantChargeStartedAt.delete(playerId);
    return false;
  }
  const startedAt = state.participantChargeStartedAt.get(playerId);
  if (startedAt === undefined) {
    state.participantChargeStartedAt.set(playerId, now);
    return false;
  }
  if (now - startedAt < state.definition.effect.chargeMs) return false;
  state.participantChargeStartedAt.delete(playerId);
  state.claimedPlayerIds.add(playerId);
  return true;
}

export function mapMechanicSnapshot(state: MapMechanicState): MapMechanicSnapshot {
  const participantIds = new Set([...state.participantChargeStartedAt.keys(), ...state.claimedPlayerIds]);
  const chargeMs = state.definition.kind === "crystal-resonance" ? state.definition.effect.chargeMs : 1;
  const participants = [...participantIds]
    .sort((left, right) => left.localeCompare(right))
    .map((playerId) => {
      const claimed = state.claimedPlayerIds.has(playerId);
      const startedAt = state.participantChargeStartedAt.get(playerId);
      const chargeProgress = claimed ? 1 : startedAt === undefined ? 0 : Math.min(1, Math.max(0, (state.now - startedAt) / chargeMs));
      return { playerId, chargeProgress, claimed };
    });

  return {
    kind: state.definition.kind,
    phase: state.phase,
    round: state.round,
    zoneIndex: state.zoneIndex,
    zone: state.definition.zones[state.zoneIndex]!,
    phaseStartedAt: state.phaseStartedAt,
    phaseEndsAt: state.phaseEndsAt,
    participants,
  };
}

function enterPhase(state: MapMechanicState, phase: MapMechanicPhase, startedAt: number, durationMs: number): void {
  state.phase = phase;
  state.phaseStartedAt = startedAt;
  state.phaseEndsAt = startedAt + durationMs;
}

function clearRoundState(state: MapMechanicState): void {
  state.participantChargeStartedAt.clear();
  state.claimedPlayerIds.clear();
  state.reactorDamageAt.clear();
}
