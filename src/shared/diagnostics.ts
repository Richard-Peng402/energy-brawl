import type { MapId } from "./map-catalog";
import type { MatchMode } from "./mode-catalog";

export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const DIAGNOSTIC_THRESHOLDS = {
  rttMs: 120,
  inputAckP95Ms: 100,
  correctionPx: 30,
  frameMs: 50,
  serverStepMs: 16,
} as const;

export type DiagnosticAlertKind = "network" | "input" | "correction" | "frame" | "server" | "reconnect";
export type DiagnosticSeverity = "normal" | "warning" | "critical";
export type DiagnosticEndReason = "normal" | "forced" | "reset" | "shutdown";

export interface NetworkDiagnosticSummary {
  effectiveType: string | null;
  downlinkMbps: number | null;
  estimatedRttMs: number | null;
  saveData: boolean | null;
}

export interface DeviceDiagnosticProfile {
  schemaVersion: 1;
  browser: string;
  browserVersion: string | null;
  platform: string;
  deviceModel: string | null;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  maxTouchPoints: number;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  network: NetworkDiagnosticSummary;
}

export interface ClientDiagnosticSample {
  schemaVersion: 1;
  matchId: string;
  sampledAt: number;
  rttMs: number | null;
  inputAckP50Ms: number | null;
  inputAckP95Ms: number | null;
  inputAckMaxMs: number | null;
  frameP50Ms: number | null;
  frameP95Ms: number | null;
  frameMaxMs: number | null;
  correctionP95Px: number | null;
  correctionMaxPx: number | null;
  hardCorrections: number;
  stalls: number;
  pendingInputs: number;
  reconnects: number;
  connected: boolean;
  network: NetworkDiagnosticSummary;
}

export interface ServerDiagnosticSample {
  sampledAt: number;
  stepP95Ms: number;
  stepMaxMs: number;
  steps: number;
  catchUpLimitHits: number;
  humans: number;
  bots: number;
  projectiles: number;
  skillEffects: number;
  acceptedSamples: number;
  rejectedSamples: number;
}

export interface DiagnosticAlertEvent {
  at: number;
  kind: DiagnosticAlertKind;
  playerAlias: string | null;
  value: number | null;
}

export interface HostDiagnosticPlayer {
  playerId: string;
  nickname: string;
  alias: string;
  isBot: boolean;
  connected: boolean;
  address: string;
  profile: DeviceDiagnosticProfile | null;
  sample: ClientDiagnosticSample | null;
  sampleAgeMs: number | null;
  alertCounts: Partial<Record<DiagnosticAlertKind, number>>;
}

export interface HostDiagnosticsSnapshot {
  schemaVersion: 1;
  matchId: string | null;
  mapId: MapId | null;
  matchMode: MatchMode | null;
  sampledAt: number;
  players: HostDiagnosticPlayer[];
  server: ServerDiagnosticSample | null;
  recentAlerts: DiagnosticAlertEvent[];
  totalAlerts: number;
}

export interface DiagnosticReportPlayer {
  alias: string;
  characterId?: string;
  address: string;
  profile: DeviceDiagnosticProfile | null;
  samples: ClientDiagnosticSample[];
  alertCounts: Partial<Record<DiagnosticAlertKind, number>>;
  reconnects: number;
}

export interface DiagnosticReport {
  schemaVersion: 1;
  gameVersion: string;
  matchId: string;
  mapId: MapId;
  matchMode: MatchMode;
  startedAt: number;
  finishedAt: number;
  endReason: DiagnosticEndReason;
  players: DiagnosticReportPlayer[];
  server: { samples: ServerDiagnosticSample[]; alertCounts: Partial<Record<DiagnosticAlertKind, number>> };
  totalAlerts: number;
}

export interface DiagnosticReportEnvelope {
  schemaVersion: 1;
  exportedAt: number;
  reports: DiagnosticReport[];
}

const finiteMetric = (value: unknown, max = 60_000): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max);
const boundedString = (value: unknown, max = 128): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const integerMetric = (value: unknown, max = 1_000_000): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;

export function isNetworkDiagnosticSummary(value: unknown): value is NetworkDiagnosticSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.effectiveType === null || (typeof item.effectiveType === "string" && item.effectiveType.length <= 32))
    && finiteMetric(item.downlinkMbps, 100_000)
    && finiteMetric(item.estimatedRttMs)
    && (item.saveData === null || typeof item.saveData === "boolean");
}

export function isClientDiagnosticSample(value: unknown): value is ClientDiagnosticSample {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === DIAGNOSTIC_SCHEMA_VERSION
    && boundedString(item.matchId)
    && finiteMetric(item.sampledAt, Number.MAX_SAFE_INTEGER)
    && finiteMetric(item.rttMs)
    && finiteMetric(item.inputAckP50Ms)
    && finiteMetric(item.inputAckP95Ms)
    && finiteMetric(item.inputAckMaxMs)
    && finiteMetric(item.frameP50Ms)
    && finiteMetric(item.frameP95Ms)
    && finiteMetric(item.frameMaxMs)
    && finiteMetric(item.correctionP95Px)
    && finiteMetric(item.correctionMaxPx)
    && integerMetric(item.hardCorrections)
    && integerMetric(item.stalls)
    && integerMetric(item.pendingInputs, 240)
    && integerMetric(item.reconnects)
    && typeof item.connected === "boolean"
    && isNetworkDiagnosticSummary(item.network);
}

export function classifyDiagnosticSample(sample: ClientDiagnosticSample): DiagnosticAlertKind[] {
  const alerts: DiagnosticAlertKind[] = [];
  if ((sample.rttMs ?? 0) > DIAGNOSTIC_THRESHOLDS.rttMs) alerts.push("network");
  if ((sample.inputAckP95Ms ?? 0) > DIAGNOSTIC_THRESHOLDS.inputAckP95Ms) alerts.push("input");
  if ((sample.correctionMaxPx ?? 0) > DIAGNOSTIC_THRESHOLDS.correctionPx) alerts.push("correction");
  if ((sample.frameMaxMs ?? 0) > DIAGNOSTIC_THRESHOLDS.frameMs) alerts.push("frame");
  if (sample.reconnects > 0 || !sample.connected) alerts.push("reconnect");
  return alerts;
}

export function classifyServerDiagnosticSample(sample: ServerDiagnosticSample): DiagnosticAlertKind[] {
  return sample.stepMaxMs > DIAGNOSTIC_THRESHOLDS.serverStepMs || sample.catchUpLimitHits > 0 ? ["server"] : [];
}

export function isDeviceDiagnosticProfile(value: unknown): value is DeviceDiagnosticProfile {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === 1 && boundedString(item.browser, 64)
    && (item.browserVersion === null || boundedString(item.browserVersion, 32))
    && boundedString(item.platform, 64)
    && (item.deviceModel === null || boundedString(item.deviceModel, 128))
    && finiteMetric(item.screenWidth, 20_000) && finiteMetric(item.screenHeight, 20_000)
    && finiteMetric(item.devicePixelRatio, 16) && integerMetric(item.maxTouchPoints, 100)
    && finiteMetric(item.hardwareConcurrency, 1_024) && finiteMetric(item.deviceMemoryGb, 1_024)
    && isNetworkDiagnosticSummary(item.network);
}

export function isDiagnosticReport(value: unknown): value is DiagnosticReport {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DiagnosticReport>;
  return item.schemaVersion === 1 && boundedString(item.gameVersion, 32) && boundedString(item.matchId)
    && ["reactor-core", "neon-docks", "crystal-ruins"].includes(String(item.mapId))
    && ["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2"].includes(String(item.matchMode))
    && finiteMetric(item.startedAt, Number.MAX_SAFE_INTEGER) && finiteMetric(item.finishedAt, Number.MAX_SAFE_INTEGER)
    && ["normal", "forced", "reset", "shutdown"].includes(String(item.endReason))
    && Array.isArray(item.players) && item.players.length <= 6
    && Boolean(item.server && Array.isArray(item.server.samples) && item.server.samples.length <= 600)
    && integerMetric(item.totalAlerts);
}
