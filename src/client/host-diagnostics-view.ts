import { DIAGNOSTIC_THRESHOLDS, type DiagnosticSeverity, type HostDiagnosticsSnapshot } from "../shared/diagnostics";

export interface DiagnosticsPlayerPresentation {
  playerLabel: string;
  alias: string;
  connection: string;
  device: string;
  network: string;
  address: string;
  rtt: string;
  inputAck: string;
  frame: string;
  correction: string;
  severity: DiagnosticSeverity;
}

export function resolveDiagnosticsPresentation(snapshot: HostDiagnosticsSnapshot | null): {
  players: DiagnosticsPlayerPresentation[];
  totalAlerts: number;
  severity: DiagnosticSeverity;
} {
  if (!snapshot) return { players: [], totalAlerts: 0, severity: "normal" };
  const players = snapshot.players.map((player) => {
    const sample = player.sample;
    const critical = !player.connected || (sample?.reconnects ?? 0) > 0;
    const warning = (sample?.rttMs ?? 0) > DIAGNOSTIC_THRESHOLDS.rttMs
      || (sample?.inputAckP95Ms ?? 0) > DIAGNOSTIC_THRESHOLDS.inputAckP95Ms
      || (sample?.correctionMaxPx ?? 0) > DIAGNOSTIC_THRESHOLDS.correctionPx
      || (sample?.frameMaxMs ?? 0) > DIAGNOSTIC_THRESHOLDS.frameMs;
    const profile = player.profile;
    const severity: DiagnosticSeverity = critical ? "critical" : warning ? "warning" : "normal";
    return {
      playerLabel: player.nickname || player.alias,
      alias: player.alias,
      connection: player.isBot ? "AI" : player.connected ? "在线" : "离线",
      device: profile ? `${profile.platform} · ${profile.browser}${profile.browserVersion ? ` ${profile.browserVersion}` : ""} · ${profile.deviceModel ?? "未知型号"}` : "未知",
      network: sample?.network.effectiveType ?? profile?.network.effectiveType ?? "未知",
      address: player.address,
      rtt: metric(sample?.rttMs, "ms"),
      inputAck: metric(sample?.inputAckP95Ms, "ms"),
      frame: metric(sample?.frameMaxMs, "ms"),
      correction: metric(sample?.correctionMaxPx, "px"),
      severity,
    };
  });
  const severity = players.some((player) => player.severity === "critical") ? "critical"
    : players.some((player) => player.severity === "warning") || (snapshot.server?.stepMaxMs ?? 0) > DIAGNOSTIC_THRESHOLDS.serverStepMs ? "warning"
      : "normal";
  return { players, totalAlerts: snapshot.totalAlerts, severity };
}

export function renderDiagnosticsPlayers(snapshot: HostDiagnosticsSnapshot | null): string {
  const presentation = resolveDiagnosticsPresentation(snapshot);
  if (!snapshot?.matchId) return `<tr><td colspan="10" class="host-diagnostics-empty">暂无对局诊断数据</td></tr>`;
  if (presentation.players.length === 0) return `<tr><td colspan="10" class="host-diagnostics-empty">本局暂无真人玩家数据</td></tr>`;
  return presentation.players.map((player) => `<tr class="is-${player.severity}">
    <td><b>${escapeHtml(player.playerLabel)}</b><small>${escapeHtml(player.alias)}</small></td>
    <td>${player.connection}</td><td>${escapeHtml(player.device)}</td><td>${escapeHtml(player.network)}</td>
    <td>${escapeHtml(player.address)}</td><td>${player.rtt}</td><td>${player.inputAck}</td><td>${player.frame}</td><td>${player.correction}</td>
  </tr>`).join("");
}

export function diagnosticsRevision(snapshot: HostDiagnosticsSnapshot | null): string {
  if (!snapshot) return "none";
  return JSON.stringify({
    matchId: snapshot.matchId,
    players: snapshot.players.map((player) => ({
      id: player.playerId, connected: player.connected, address: player.address, profile: player.profile,
      rtt: player.sample?.rttMs, input: player.sample?.inputAckP95Ms, frame: player.sample?.frameMaxMs,
      correction: player.sample?.correctionMaxPx, reconnects: player.sample?.reconnects,
    })),
    server: snapshot.server,
    alerts: snapshot.totalAlerts,
  });
}

function metric(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? "未知" : `${Math.round(value)}${unit}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
