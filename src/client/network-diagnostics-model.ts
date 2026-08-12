import { DIAGNOSTIC_THRESHOLDS } from "../shared/diagnostics";

export type PlayerHealthCause = "reconnect" | "server" | "frame" | "correction" | "input" | "network" | "normal";

export interface PlayerHealthMetrics {
  connected?: boolean;
  reconnects?: number;
  serverStepMaxMs?: number | null;
  serverCatchUpLimitHits?: number;
  frameMaxMs?: number | null;
  correctionMaxPx?: number | null;
  inputAckP95Ms?: number | null;
  rttMs?: number | null;
}

export function diagnosePlayerHealth(metrics: PlayerHealthMetrics): PlayerHealthCause {
  if (metrics.connected === false || (metrics.reconnects ?? 0) > 0) return "reconnect";
  if ((metrics.serverStepMaxMs ?? 0) > DIAGNOSTIC_THRESHOLDS.serverStepMs || (metrics.serverCatchUpLimitHits ?? 0) > 0) return "server";
  if ((metrics.frameMaxMs ?? 0) > DIAGNOSTIC_THRESHOLDS.frameMs) return "frame";
  if ((metrics.correctionMaxPx ?? 0) > DIAGNOSTIC_THRESHOLDS.correctionPx) return "correction";
  if ((metrics.inputAckP95Ms ?? 0) > DIAGNOSTIC_THRESHOLDS.inputAckP95Ms) return "input";
  if ((metrics.rttMs ?? 0) > DIAGNOSTIC_THRESHOLDS.rttMs) return "network";
  return "normal";
}
