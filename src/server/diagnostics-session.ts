import type { CharacterId } from "../shared/character-catalog";
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  classifyDiagnosticSample,
  classifyServerDiagnosticSample,
  sanitizeClientDiagnosticSample,
  sanitizeDeviceDiagnosticProfile,
  type ClientDiagnosticSample,
  type DeviceDiagnosticProfile,
  type DiagnosticAlertEvent,
  type DiagnosticAlertKind,
  type DiagnosticEndReason,
  type DiagnosticReport,
  type HostDiagnosticsSnapshot,
  type ServerDiagnosticSample,
} from "../shared/diagnostics";
import type { MapId } from "../shared/map-catalog";
import type { MatchMode } from "../shared/mode-catalog";

const MAX_CLIENT_SAMPLES = 600;
const MAX_SERVER_SAMPLES = 600;
const MAX_RECENT_ALERTS = 50;

export interface DiagnosticsMatchStart {
  matchId: string;
  mapId: MapId;
  matchMode: MatchMode;
  startedAt: number;
  players: Array<{
    playerId: string;
    nickname: string;
    characterId: CharacterId;
    address: string;
  }>;
}

interface PlayerState {
  playerId: string;
  nickname: string;
  characterId: CharacterId;
  alias: string;
  address: string;
  profile: DeviceDiagnosticProfile | null;
  sample: ClientDiagnosticSample | null;
  receivedAt: number | null;
  samples: ClientDiagnosticSample[];
  alertCounts: Partial<Record<DiagnosticAlertKind, number>>;
  alertSeconds: Set<string>;
  connected: boolean;
  reconnects: number;
}

interface ActiveSession {
  matchId: string;
  mapId: MapId;
  matchMode: MatchMode;
  startedAt: number;
  players: Map<string, PlayerState>;
  serverSamples: ServerDiagnosticSample[];
  serverAlertCounts: Partial<Record<DiagnosticAlertKind, number>>;
  serverAlertSeconds: Set<string>;
  recentAlerts: DiagnosticAlertEvent[];
}

export class DiagnosticsSession {
  private active: ActiveSession | null = null;
  private completedReport: DiagnosticReport | null = null;

  constructor(private readonly gameVersion = "unknown") {}

  get latestReport(): DiagnosticReport | null {
    return this.completedReport;
  }

  start(input: DiagnosticsMatchStart): void {
    const players = new Map<string, PlayerState>();
    input.players.slice(0, 6).forEach((player, index) => {
      players.set(player.playerId, {
        ...player,
        alias: `P${index + 1}`,
        profile: null,
        sample: null,
        receivedAt: null,
        samples: [],
        alertCounts: {},
        alertSeconds: new Set(),
        connected: true,
        reconnects: 0,
      });
    });
    this.active = {
      matchId: input.matchId,
      mapId: input.mapId,
      matchMode: input.matchMode,
      startedAt: input.startedAt,
      players,
      serverSamples: [],
      serverAlertCounts: {},
      serverAlertSeconds: new Set(),
      recentAlerts: [],
    };
  }

  setProfile(playerId: string, profile: DeviceDiagnosticProfile, maskedAddress: string): boolean {
    const player = this.active?.players.get(playerId);
    const sanitized = sanitizeDeviceDiagnosticProfile(profile);
    if (!player || !sanitized) return false;
    player.profile = sanitized;
    player.address = maskedAddress;
    return true;
  }

  acceptClientSample(playerId: string, sample: ClientDiagnosticSample, receivedAt: number): boolean {
    const active = this.active;
    const player = active?.players.get(playerId);
    const stored = sanitizeClientDiagnosticSample(sample);
    if (!active || !player || !stored || stored.matchId !== active.matchId) return false;
    player.sample = stored;
    player.receivedAt = receivedAt;
    pushBounded(player.samples, stored, MAX_CLIENT_SAMPLES);
    for (const kind of classifyDiagnosticSample(stored)) {
      const key = `${Math.floor(receivedAt / 1_000)}:${kind}`;
      if (player.alertSeconds.has(key)) continue;
      player.alertSeconds.add(key);
      increment(player.alertCounts, kind);
      this.addAlert({ at: receivedAt, kind, playerAlias: player.alias, value: alertValue(kind, stored) });
    }
    return true;
  }

  recordServerSample(sample: ServerDiagnosticSample): void {
    const active = this.active;
    if (!active) return;
    const stored = structuredClone(sample);
    pushBounded(active.serverSamples, stored, MAX_SERVER_SAMPLES);
    for (const kind of classifyServerDiagnosticSample(stored)) {
      const key = `${Math.floor(stored.sampledAt / 1_000)}:${kind}`;
      if (active.serverAlertSeconds.has(key)) continue;
      active.serverAlertSeconds.add(key);
      increment(active.serverAlertCounts, kind);
      this.addAlert({ at: stored.sampledAt, kind, playerAlias: null, value: stored.stepMaxMs });
    }
  }

  recordDisconnect(playerId: string, at: number): void {
    const player = this.active?.players.get(playerId);
    if (!player) return;
    player.connected = false;
    this.recordConnectionAlert(player, at);
  }

  recordReconnect(playerId: string, at: number): void {
    const player = this.active?.players.get(playerId);
    if (!player) return;
    player.connected = true;
    player.reconnects += 1;
    this.recordConnectionAlert(player, at);
  }

  snapshot(now: number): HostDiagnosticsSnapshot {
    const active = this.active;
    if (!active) {
      return { schemaVersion: DIAGNOSTIC_SCHEMA_VERSION, matchId: null, mapId: null, matchMode: null, sampledAt: now, players: [], server: null, recentAlerts: [], totalAlerts: 0 };
    }
    return {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      matchId: active.matchId,
      mapId: active.mapId,
      matchMode: active.matchMode,
      sampledAt: now,
      players: [...active.players.values()].map((player) => ({
        playerId: player.playerId,
        nickname: player.nickname,
        alias: player.alias,
        isBot: false,
        connected: player.connected,
        address: player.address,
        profile: player.profile ? structuredClone(player.profile) : null,
        sample: player.sample ? structuredClone(player.sample) : null,
        sampleAgeMs: player.receivedAt === null ? null : Math.max(0, now - player.receivedAt),
        alertCounts: { ...player.alertCounts },
      })),
      server: active.serverSamples.at(-1) ? structuredClone(active.serverSamples.at(-1)!) : null,
      recentAlerts: structuredClone(active.recentAlerts),
      totalAlerts: totalAlertCount(active),
    };
  }

  finish(finishedAt: number, reason: DiagnosticEndReason): DiagnosticReport | null {
    const active = this.active;
    if (!active) return null;
    const report: DiagnosticReport = {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      gameVersion: this.gameVersion,
      matchId: active.matchId,
      mapId: active.mapId,
      matchMode: active.matchMode,
      startedAt: active.startedAt,
      finishedAt,
      endReason: reason,
      players: [...active.players.values()].map((player) => ({
        alias: player.alias,
        characterId: player.characterId,
        address: player.address,
        profile: player.profile ? structuredClone(player.profile) : null,
        samples: structuredClone(player.samples),
        alertCounts: { ...player.alertCounts },
        reconnects: player.reconnects,
      })),
      server: { samples: structuredClone(active.serverSamples), alertCounts: { ...active.serverAlertCounts } },
      totalAlerts: totalAlertCount(active),
    };
    this.completedReport = report;
    this.active = null;
    return report;
  }

  private recordConnectionAlert(player: PlayerState, at: number): void {
    const key = `${Math.floor(at / 1_000)}:reconnect`;
    if (player.alertSeconds.has(key)) return;
    player.alertSeconds.add(key);
    increment(player.alertCounts, "reconnect");
    this.addAlert({ at, kind: "reconnect", playerAlias: player.alias, value: null });
  }

  private addAlert(alert: DiagnosticAlertEvent): void {
    if (!this.active) return;
    pushBounded(this.active.recentAlerts, alert, MAX_RECENT_ALERTS);
  }
}

function pushBounded<T>(items: T[], value: T, capacity: number): void {
  items.push(value);
  if (items.length > capacity) items.splice(0, items.length - capacity);
}

function increment(counts: Partial<Record<DiagnosticAlertKind, number>>, kind: DiagnosticAlertKind): void {
  counts[kind] = (counts[kind] ?? 0) + 1;
}

function totalAlertCount(active: ActiveSession): number {
  const playerAlerts = [...active.players.values()].reduce((total, player) => total + Object.values(player.alertCounts).reduce((sum, count) => sum + (count ?? 0), 0), 0);
  return playerAlerts + Object.values(active.serverAlertCounts).reduce((sum, count) => sum + (count ?? 0), 0);
}

function alertValue(kind: DiagnosticAlertKind, sample: ClientDiagnosticSample): number | null {
  if (kind === "network") return sample.rttMs;
  if (kind === "input") return sample.inputAckP95Ms;
  if (kind === "correction") return sample.correctionMaxPx;
  if (kind === "frame") return sample.frameMaxMs;
  return null;
}
