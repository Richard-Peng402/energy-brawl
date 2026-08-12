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
export const MAX_DIAGNOSTIC_SAMPLE_JSON_CHARS = 2_048;

export function isDiagnosticPayloadWithinLimit(value: unknown, maxChars = MAX_DIAGNOSTIC_SAMPLE_JSON_CHARS): boolean {
  try {
    return JSON.stringify(value).length <= maxChars;
  } catch {
    return false;
  }
}

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

const finiteNumber = (value: unknown, max = 60_000): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
const nullableFiniteMetric = (value: unknown, max = 60_000): value is number | null =>
  value === null || finiteNumber(value, max);
const boundedString = (value: unknown, max = 128): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const integerMetric = (value: unknown, max = 1_000_000): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;

export function isNetworkDiagnosticSummary(value: unknown): value is NetworkDiagnosticSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.effectiveType === null || (typeof item.effectiveType === "string" && item.effectiveType.length <= 32))
    && nullableFiniteMetric(item.downlinkMbps, 100_000)
    && nullableFiniteMetric(item.estimatedRttMs)
    && (item.saveData === null || typeof item.saveData === "boolean");
}

export function sanitizeNetworkDiagnosticSummary(value: unknown): NetworkDiagnosticSummary | null {
  if (!isNetworkDiagnosticSummary(value)) return null;
  return {
    effectiveType: value.effectiveType,
    downlinkMbps: value.downlinkMbps,
    estimatedRttMs: value.estimatedRttMs,
    saveData: value.saveData,
  };
}

export function isClientDiagnosticSample(value: unknown): value is ClientDiagnosticSample {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === DIAGNOSTIC_SCHEMA_VERSION
    && boundedString(item.matchId)
    && finiteNumber(item.sampledAt, Number.MAX_SAFE_INTEGER)
    && nullableFiniteMetric(item.rttMs)
    && nullableFiniteMetric(item.inputAckP50Ms)
    && nullableFiniteMetric(item.inputAckP95Ms)
    && nullableFiniteMetric(item.inputAckMaxMs)
    && nullableFiniteMetric(item.frameP50Ms)
    && nullableFiniteMetric(item.frameP95Ms)
    && nullableFiniteMetric(item.frameMaxMs)
    && nullableFiniteMetric(item.correctionP95Px)
    && nullableFiniteMetric(item.correctionMaxPx)
    && integerMetric(item.hardCorrections)
    && integerMetric(item.stalls)
    && integerMetric(item.pendingInputs, 240)
    && integerMetric(item.reconnects)
    && typeof item.connected === "boolean"
    && isNetworkDiagnosticSummary(item.network);
}

export function sanitizeClientDiagnosticSample(value: unknown): ClientDiagnosticSample | null {
  if (!isClientDiagnosticSample(value)) return null;
  const network = sanitizeNetworkDiagnosticSummary(value.network);
  if (!network) return null;
  const sample: ClientDiagnosticSample = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    matchId: value.matchId,
    sampledAt: value.sampledAt,
    rttMs: value.rttMs,
    inputAckP50Ms: value.inputAckP50Ms,
    inputAckP95Ms: value.inputAckP95Ms,
    inputAckMaxMs: value.inputAckMaxMs,
    frameP50Ms: value.frameP50Ms,
    frameP95Ms: value.frameP95Ms,
    frameMaxMs: value.frameMaxMs,
    correctionP95Px: value.correctionP95Px,
    correctionMaxPx: value.correctionMaxPx,
    hardCorrections: value.hardCorrections,
    stalls: value.stalls,
    pendingInputs: value.pendingInputs,
    reconnects: value.reconnects,
    connected: value.connected,
    network,
  };
  return JSON.stringify(sample).length <= MAX_DIAGNOSTIC_SAMPLE_JSON_CHARS ? sample : null;
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
    && finiteNumber(item.screenWidth, 20_000) && finiteNumber(item.screenHeight, 20_000)
    && finiteNumber(item.devicePixelRatio, 16) && integerMetric(item.maxTouchPoints, 100)
    && nullableFiniteMetric(item.hardwareConcurrency, 1_024) && nullableFiniteMetric(item.deviceMemoryGb, 1_024)
    && isNetworkDiagnosticSummary(item.network);
}

export function sanitizeDeviceDiagnosticProfile(value: unknown): DeviceDiagnosticProfile | null {
  if (!isDeviceDiagnosticProfile(value)) return null;
  const network = sanitizeNetworkDiagnosticSummary(value.network);
  if (!network) return null;
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    browser: value.browser,
    browserVersion: value.browserVersion,
    platform: value.platform,
    deviceModel: value.deviceModel,
    screenWidth: value.screenWidth,
    screenHeight: value.screenHeight,
    devicePixelRatio: value.devicePixelRatio,
    maxTouchPoints: value.maxTouchPoints,
    hardwareConcurrency: value.hardwareConcurrency,
    deviceMemoryGb: value.deviceMemoryGb,
    network,
  };
}

export function isDiagnosticReport(value: unknown): value is DiagnosticReport {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DiagnosticReport>;
  return item.schemaVersion === 1 && boundedString(item.gameVersion, 32) && boundedString(item.matchId)
    && ["reactor-core", "neon-docks", "crystal-ruins"].includes(String(item.mapId))
    && ["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2"].includes(String(item.matchMode))
    && finiteNumber(item.startedAt, Number.MAX_SAFE_INTEGER) && finiteNumber(item.finishedAt, Number.MAX_SAFE_INTEGER)
    && ["normal", "forced", "reset", "shutdown"].includes(String(item.endReason))
    && Array.isArray(item.players) && item.players.length <= 6 && item.players.every(isDiagnosticReportPlayer)
    && Boolean(item.server && Array.isArray(item.server.samples) && item.server.samples.length <= 600
      && item.server.samples.every(isServerDiagnosticSample) && isAlertCounts(item.server.alertCounts))
    && integerMetric(item.totalAlerts);
}

export function sanitizeDiagnosticReport(value: unknown): DiagnosticReport | null {
  if (!isDiagnosticReport(value)) return null;
  const players: DiagnosticReportPlayer[] = [];
  for (const player of value.players) {
    const profile = player.profile === null ? null : sanitizeDeviceDiagnosticProfile(player.profile);
    const samples = player.samples.map(sanitizeClientDiagnosticSample);
    if ((player.profile !== null && !profile) || samples.some((sample) => sample === null)) return null;
    players.push({
      alias: player.alias,
      ...(player.characterId ? { characterId: player.characterId } : {}),
      address: player.address,
      profile,
      samples: samples as ClientDiagnosticSample[],
      alertCounts: sanitizeAlertCounts(player.alertCounts),
      reconnects: player.reconnects,
    });
  }
  const serverSamples = value.server.samples.map(sanitizeServerDiagnosticSample);
  if (serverSamples.some((sample) => sample === null)) return null;
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    gameVersion: value.gameVersion,
    matchId: value.matchId,
    mapId: value.mapId,
    matchMode: value.matchMode,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    endReason: value.endReason,
    players,
    server: {
      samples: serverSamples as ServerDiagnosticSample[],
      alertCounts: sanitizeAlertCounts(value.server.alertCounts),
    },
    totalAlerts: value.totalAlerts,
  };
}

function isDiagnosticReportPlayer(value: unknown): value is DiagnosticReportPlayer {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DiagnosticReportPlayer>;
  return boundedString(item.alias, 8)
    && (item.characterId === undefined || boundedString(item.characterId, 64))
    && boundedString(item.address, 128)
    && (item.profile === null || isDeviceDiagnosticProfile(item.profile))
    && Array.isArray(item.samples) && item.samples.length <= 600 && item.samples.every(isClientDiagnosticSample)
    && isAlertCounts(item.alertCounts)
    && integerMetric(item.reconnects);
}

function isServerDiagnosticSample(value: unknown): value is ServerDiagnosticSample {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ServerDiagnosticSample>;
  return finiteNumber(item.sampledAt, Number.MAX_SAFE_INTEGER)
    && finiteNumber(item.stepP95Ms) && finiteNumber(item.stepMaxMs)
    && integerMetric(item.steps) && integerMetric(item.catchUpLimitHits)
    && integerMetric(item.humans, 6) && integerMetric(item.bots, 6)
    && integerMetric(item.projectiles) && integerMetric(item.skillEffects)
    && integerMetric(item.acceptedSamples) && integerMetric(item.rejectedSamples);
}

function sanitizeServerDiagnosticSample(value: unknown): ServerDiagnosticSample | null {
  if (!isServerDiagnosticSample(value)) return null;
  return {
    sampledAt: value.sampledAt,
    stepP95Ms: value.stepP95Ms,
    stepMaxMs: value.stepMaxMs,
    steps: value.steps,
    catchUpLimitHits: value.catchUpLimitHits,
    humans: value.humans,
    bots: value.bots,
    projectiles: value.projectiles,
    skillEffects: value.skillEffects,
    acceptedSamples: value.acceptedSamples,
    rejectedSamples: value.rejectedSamples,
  };
}

function isAlertCounts(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.every(([kind, count]) => ["network", "input", "correction", "frame", "server", "reconnect"].includes(kind) && integerMetric(count));
}

function sanitizeAlertCounts(value: Partial<Record<DiagnosticAlertKind, number>>): Partial<Record<DiagnosticAlertKind, number>> {
  const result: Partial<Record<DiagnosticAlertKind, number>> = {};
  for (const kind of ["network", "input", "correction", "frame", "server", "reconnect"] as const) {
    const count = value[kind];
    if (count !== undefined) result[kind] = count;
  }
  return result;
}
