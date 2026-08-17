import type { MatchMode } from "../shared/mode-catalog";
import type { MapSelection } from "../shared/map-catalog";
import type { BotDifficulty } from "../shared/bot-difficulty";
import type { AdminStat, GamePhase, GameSnapshot, RoomSnapshot, ServerInfo, TeamScoreSnapshot } from "../shared/protocol";
import { GameNetworkClient } from "./network";
import { DiagnosticsReportStore } from "./diagnostics-report-store";
import {
  diagnosticsRevision,
  renderDiagnosticsPlayers,
  resolveDiagnosticsPresentation,
  resolveDiagnosticsSnapshot,
} from "./host-diagnostics-view";
import { ServerInfoRefreshController, type ServerInfoRefreshState } from "./server-info-refresh";
import { teamLabel } from "./team-label";
import { mapMechanicLobbyView, randomMapMechanicSummaries } from "./map-mechanic-visuals";
import { mapEventLobbyView } from "./map-event-visuals";
import { RoomPresetStore } from "./room-preset-store";

export class HostApp {
  private readonly network = new GameNetworkClient(false);
  private readonly infoRefresh = new ServerInfoRefreshController();
  private readonly token = new URLSearchParams(window.location.search).get("token") ?? "";
  private readonly diagnosticReports = new DiagnosticsReportStore(window.localStorage);
  private readonly roomPresets = new RoomPresetStore(window.localStorage);
  private info: ServerInfo | null = null;
  private infoState: ServerInfoRefreshState = this.infoRefresh.state;
  private renderedNetworkRevision: string | null = null;
  private message = "";
  private editingPlayerId: string | null = null;
  private selectedSwapPlayerId: string | null = null;
  private diagnosticsConnectionVersion = -1;
  private renderedDiagnosticsRevision = "";
  private savedDiagnosticReportId: string | null = null;
  private selectedPresetId: string | null = null;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = hostTemplate();
    this.bindActions();
    this.network.subscribe(() => {
      void this.syncDiagnosticsSubscription();
      this.saveLatestDiagnosticReport();
      this.render();
    });
    this.infoRefresh.subscribe((state) => {
      this.infoState = state;
      this.info = state.info;
      this.render();
    });
    this.infoRefresh.start();
  }

  private bindActions(): void {
    this.find("#host-start").addEventListener("click", () => void this.command("start"));
    this.find("#host-end").addEventListener("click", () => void this.command("end"));
    this.find("#host-reset").addEventListener("click", () => void this.command("reset"));
    this.find<HTMLSelectElement>("#host-mode").addEventListener("change", (event) => {
      void this.admin({ type: "setMode", mode: (event.target as HTMLSelectElement).value as MatchMode });
    });
    this.find<HTMLSelectElement>("#host-map").addEventListener("change", (event) => {
      void this.admin({ type: "setMap", mapSelection: (event.target as HTMLSelectElement).value as MapSelection });
    });
    this.find<HTMLInputElement>("#host-map-mechanics").addEventListener("change", (event) => {
      const checkbox = event.target as HTMLInputElement;
      void this.admin({ type: "setMapMechanics", enabled: checkbox.checked });
    });
    this.find<HTMLInputElement>("#host-map-events").addEventListener("change", (event) => {
      const checkbox = event.target as HTMLInputElement;
      void this.admin({ type: "setMapEvents", enabled: checkbox.checked });
    });
    this.find<HTMLSelectElement>("#host-bot-difficulty").addEventListener("change", (event) => {
      void this.admin({ type: "setBotDifficulty", difficulty: (event.target as HTMLSelectElement).value as BotDifficulty });
    });
    this.find<HTMLSelectElement>("#host-preset").addEventListener("change", (event) => {
      this.selectedPresetId = (event.target as HTMLSelectElement).value || null;
      this.renderPresetControls(canEditLobbyRules(this.network.room?.phase ?? "lobby", this.token));
    });
    this.find("#host-preset-save").addEventListener("click", () => this.saveRoomPreset());
    this.find("#host-preset-apply").addEventListener("click", () => void this.applySelectedPreset());
    this.find("#host-preset-rename").addEventListener("click", () => this.renameSelectedPreset());
    this.find("#host-preset-delete").addEventListener("click", () => this.deleteSelectedPreset());
    this.find("#host-team-controls").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-team-action]");
      if (!button) return;
      if (button.dataset.teamAction === "forceWinner" && button.dataset.teamId) {
        void this.admin({ type: "forceTeamWinner", teamId: button.dataset.teamId as "red" | "blue" | "gold" });
        return;
      }
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      if (!this.selectedSwapPlayerId) {
        this.selectedSwapPlayerId = playerId;
        this.message = "已选择第一名玩家，请选择另一队玩家";
        this.render();
        return;
      }
      const firstPlayerId = this.selectedSwapPlayerId;
      this.selectedSwapPlayerId = null;
      void this.admin({ type: "swapTeams", firstPlayerId, secondPlayerId: playerId });
    });
    this.find("#host-roster").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-admin-action]");
      if (!button) return;
      const playerId = button.dataset.playerId;
      const action = button.dataset.adminAction;
      if (!playerId || !action) return;
      const lobby = (this.network.room?.phase ?? "lobby") === "lobby";
      if (action === "kick" && window.confirm(lobby ? "确认踢出该玩家并释放大厅席位？" : "确认踢出该玩家？本局将由 AI 接管。")) {
        void this.admin({ type: "kick", playerId });
      } else if (action === "forceWinner" && window.confirm(lobby ? "确认将该玩家预设为下一局胜者？开局后将立即结算。" : "确认强制该玩家获胜并结束本局？")) {
        void this.admin({ type: "forceWinner", playerId });
      } else if (action === "setStat") {
        this.openStatEditor(playerId);
      }
    });
    this.find<HTMLSelectElement>("#stat-field").addEventListener("change", () => this.fillCurrentStatValue());
    this.find("#stat-cancel").addEventListener("click", () => this.find<HTMLDialogElement>("#stat-editor").close());
    this.find<HTMLFormElement>("#stat-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.editingPlayerId) return;
      const stat = this.find<HTMLSelectElement>("#stat-field").value as AdminStat;
      const value = Number(this.find<HTMLInputElement>("#stat-value").value);
      if (!Number.isFinite(value)) return;
      const playerId = this.editingPlayerId;
      this.find<HTMLDialogElement>("#stat-editor").close();
      void this.admin({ type: "setStat", playerId, stat, value });
    });
    this.find<HTMLButtonElement>("[data-diagnostics-toggle]").addEventListener("click", () => {
      const body = this.find<HTMLElement>("[data-diagnostics-body]");
      const toggle = this.find<HTMLButtonElement>("[data-diagnostics-toggle]");
      body.hidden = !body.hidden;
      toggle.setAttribute("aria-expanded", String(!body.hidden));
    });
    this.find("[data-diagnostics-reports]").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-diagnostics-action]");
      if (!button) return;
      const action = button.dataset.diagnosticsAction;
      if (action === "export") this.diagnosticReports.download();
      else if (action === "clear") {
        this.diagnosticReports.clear();
        this.renderDiagnostics(true);
      } else if (action === "delete" && button.dataset.matchId) {
        this.diagnosticReports.remove(button.dataset.matchId);
        this.renderDiagnostics(true);
      }
    });
  }

  private async syncDiagnosticsSubscription(): Promise<void> {
    if (!this.network.connected) {
      return;
    }
    const connectionVersion = this.network.connectionVersion;
    if (this.diagnosticsConnectionVersion === connectionVersion || !this.token) return;
    this.diagnosticsConnectionVersion = connectionVersion;
    const result = await this.network.subscribeHostDiagnostics(this.token);
    if (!this.network.connected || this.network.connectionVersion !== connectionVersion) return;
    if (!result.ok) this.message = result.error ?? "无法订阅性能诊断";
  }

  private saveLatestDiagnosticReport(): void {
    const report = this.network.latestDiagnosticReport;
    if (!report || report.matchId === this.savedDiagnosticReportId) return;
    this.diagnosticReports.save(report);
    this.savedDiagnosticReportId = report.matchId;
  }

  private openStatEditor(playerId: string): void {
    const player = this.presentedPlayer(playerId);
    if (!player) return;
    this.editingPlayerId = playerId;
    this.find("#stat-player-name").textContent = player.nickname;
    this.fillCurrentStatValue();
    this.find<HTMLDialogElement>("#stat-editor").showModal();
  }

  private fillCurrentStatValue(): void {
    const player = this.editingPlayerId ? this.presentedPlayer(this.editingPlayerId) : undefined;
    if (!player) return;
    const stat = this.find<HTMLSelectElement>("#stat-field").value as AdminStat;
    this.find<HTMLInputElement>("#stat-value").value = String(player[stat]);
  }

  private async command(command: "start" | "end" | "reset"): Promise<void> {
    const result = await this.network.hostCommand(this.token, command);
    this.message = result.ok ? "命令已执行" : result.error ?? "命令执行失败";
    this.render();
  }

  private async admin(command: Parameters<GameNetworkClient["hostAdminCommand"]>[1]): Promise<void> {
    const result = await this.network.hostAdminCommand(this.token, command);
    this.message = result.ok ? "房主命令已生效" : result.error ?? "房主命令执行失败";
    this.render();
  }

  private saveRoomPreset(): void {
    const room = this.network.room ?? this.info?.room;
    if (!room || room.phase !== "lobby") return;
    const name = window.prompt("预设名称", `房间预设 ${this.roomPresets.list().length + 1}`)?.trim();
    if (!name) return;
    const preset = RoomPresetStore.fromRoom(room, name);
    if (!this.roomPresets.save(preset)) return;
    this.selectedPresetId = preset.id;
    this.message = "房间预设已保存到本机";
    this.render();
  }

  private async applySelectedPreset(): Promise<void> {
    const preset = this.roomPresets.list().find((candidate) => candidate.id === this.selectedPresetId);
    if (!preset) return;
    await this.admin({ type: "applyRoomPreset", preset });
  }

  private renameSelectedPreset(): void {
    const preset = this.roomPresets.list().find((candidate) => candidate.id === this.selectedPresetId);
    if (!preset) return;
    const name = window.prompt("新的预设名称", preset.name)?.trim();
    if (!name || !this.roomPresets.rename(preset.id, name)) return;
    this.message = "房间预设已重命名";
    this.render();
  }

  private deleteSelectedPreset(): void {
    if (!this.selectedPresetId || !window.confirm("确认删除这个本机房间预设？")) return;
    this.roomPresets.remove(this.selectedPresetId);
    this.selectedPresetId = null;
    this.message = "房间预设已删除";
    this.render();
  }

  private renderPresetControls(enabled: boolean): void {
    const presets = this.roomPresets.list();
    if (!presets.some((preset) => preset.id === this.selectedPresetId)) this.selectedPresetId = presets[0]?.id ?? null;
    const select = this.find<HTMLSelectElement>("#host-preset");
    select.innerHTML = presets.length
      ? presets.map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`).join("")
      : `<option value="">暂无本机预设</option>`;
    select.value = this.selectedPresetId ?? "";
    select.disabled = !enabled || presets.length === 0;
    this.find<HTMLButtonElement>("#host-preset-save").disabled = !enabled;
    for (const id of ["#host-preset-apply", "#host-preset-rename", "#host-preset-delete"]) {
      this.find<HTMLButtonElement>(id).disabled = !enabled || !this.selectedPresetId;
    }
  }

  private render(): void {
    const room = this.network.room ?? this.info?.room;
    const presentation = resolveHostPresentation(room ?? null, this.network.game);
    this.find("#host-connection").textContent = this.network.connected ? "服务器在线" : "正在连接";
    this.find("#host-connection").classList.toggle("is-offline", !this.network.connected);
    this.find("#host-phase").textContent = phaseName(presentation.phase);
    this.find("#host-count").textContent = `${presentation.players.filter((player) => !player.isBot).length} / 6`;
    this.find("#host-message").textContent = this.token ? this.message : "主机令牌缺失，请从服务器启动窗口打开此页面";

    const joinUrl = this.info?.joinUrls[0] ?? "正在获取局域网地址";
    this.find("#join-url").textContent = joinUrl;
    const qr = this.find<HTMLImageElement>("#join-qr");
    if (this.info?.qrDataUrls[0] && this.renderedNetworkRevision === null) {
      qr.src = this.info.qrDataUrls[0];
      qr.classList.remove("is-loading");
    }
    this.renderNetworkInfo();

    const players = presentation.players;
    const phase = presentation.phase;
    const adminEnabled = canUseHostAdmin(phase, this.token);
    const pendingWinnerId = room?.pendingWinnerId ?? null;
    const lobbyRulesEnabled = canEditLobbyRules(phase, this.token);
    const modeSelect = this.find<HTMLSelectElement>("#host-mode");
    modeSelect.value = presentation.matchMode;
    modeSelect.disabled = !lobbyRulesEnabled;
    const mapSelect = this.find<HTMLSelectElement>("#host-map");
    mapSelect.value = room?.mapSelection ?? "reactor-core";
    mapSelect.disabled = !lobbyRulesEnabled;
    const checkbox = this.find<HTMLInputElement>("#host-map-mechanics");
    checkbox.checked = room?.mapMechanicsEnabled ?? true;
    checkbox.disabled = !lobbyRulesEnabled;
    const eventCheckbox = this.find<HTMLInputElement>("#host-map-events");
    eventCheckbox.checked = room?.mapEventsEnabled ?? true;
    eventCheckbox.disabled = !lobbyRulesEnabled;
    const botDifficulty = this.find<HTMLSelectElement>("#host-bot-difficulty");
    botDifficulty.value = room?.botDifficulty ?? "normal";
    botDifficulty.disabled = !lobbyRulesEnabled;
    this.renderPresetControls(lobbyRulesEnabled);
    const mapSelection = room?.mapSelection ?? "reactor-core";
    const mechanismsEnabled = room?.mapMechanicsEnabled ?? true;
    const mechanicDescription = this.find("#host-map-mechanic-description");
    if (!mechanismsEnabled) mechanicDescription.textContent = "动态机制已关闭";
    else if (mapSelection === "random") {
      mechanicDescription.textContent = `随机轮换：${randomMapMechanicSummaries().map((entry) => entry.title).join(" / ")}`;
    } else {
      const view = mapMechanicLobbyView(mapSelection, true);
      mechanicDescription.textContent = `${view.title} · ${view.timing} · ${view.counterplay}`;
    }
    const eventView = mapEventLobbyView(room?.mapEventsEnabled ?? true);
    this.find("#host-map-event-description").textContent = `${eventView.summary}${eventView.counterplay ? ` ${eventView.counterplay}` : ""}`;
    this.find("#host-team-controls").innerHTML = presentation.matchMode === "solo"
      ? ""
      : presentation.teamScores.map((team) => {
          const members = players.filter((player) => player.teamId === team.teamId);
          return `<div class="host-team-card"><b>${teamName(team.teamId)} ${team.score}/${team.targetScore}</b><div>${members.map((player) => `<button type="button" data-team-action="swap" data-player-id="${player.id}" ${lobbyRulesEnabled ? "" : "disabled"}>${escapeHtml(player.nickname)}</button>`).join("")}</div><button type="button" data-team-action="forceWinner" data-team-id="${team.teamId}" ${adminEnabled ? "" : "disabled"}>强制本队获胜</button></div>`;
        }).join("");
    this.find("#host-roster").innerHTML = Array.from({ length: 6 }, (_, index) => players[index])
      .map((player, index) =>
        player
          ? `<div class="host-seat${pendingWinnerId === player.id ? " is-preset-winner" : ""}"><span class="seat-index">${index + 1}</span><i style="--player-color:${player.color}"></i><div class="host-player-name"><b>${escapeHtml(player.nickname)}</b><small><em class="host-player-team">${teamLabel(player.teamId)}</em>${pendingWinnerId === player.id ? "已预设胜者" : player.isBot ? "AI" : player.connected ? "在线" : "离线"}</small></div><span class="host-player-stats">生命 ${player.health}/${player.maxHealth} · 伤害 ${player.damage} · 积分 ${player.score} · 击杀 ${player.kills} · 能量 ${player.energyCollected} · 移速 ${player.moveSpeed} · 弹速 ${player.projectileSpeed} · 射击 ${player.fireCooldownMs}ms</span><div class="host-player-actions">${adminEnabled ? `<button type="button" data-admin-action="setStat" data-player-id="${player.id}">改数值</button><button type="button" data-admin-action="kick" data-player-id="${player.id}">踢出</button><button type="button" data-admin-action="forceWinner" data-player-id="${player.id}">${phase === "lobby" ? "预设获胜" : "强制获胜"}</button>` : ""}</div></div>`
          : `<div class="host-seat is-empty"><span class="seat-index">${index + 1}</span><i></i><b>空位</b><span>等待玩家</span><strong>—</strong></div>`,
      )
      .join("");

    const hasToken = this.token.length > 0;
    this.find<HTMLButtonElement>("#host-start").disabled = !hasToken || !room?.canStart || phase !== "lobby";
    this.find<HTMLButtonElement>("#host-end").disabled = !hasToken || (phase !== "playing" && phase !== "overtime");
    const resetButton = this.find<HTMLButtonElement>("#host-reset");
    resetButton.disabled = !hasToken || phase === "lobby";
    resetButton.title = phase === "finished" ? "返回大厅重新选角" : "返回大厅";
    const resetLabel = resetButton.querySelector("span");
    if (resetLabel) resetLabel.textContent = phase === "finished" ? "赛后重开" : "重置";
    this.renderDiagnostics();
  }

  private renderDiagnostics(force = false): void {
    const reports = this.diagnosticReports.list();
    const activeSnapshot = this.network.hostDiagnostics;
    const completedReport = this.network.latestDiagnosticReport ?? reports[0] ?? null;
    const snapshot = resolveDiagnosticsSnapshot(activeSnapshot, completedReport);
    const revision = `${diagnosticsRevision(snapshot)}|${reports.map((report) => `${report.matchId}:${report.finishedAt}`).join(",")}`;
    if (!force && revision === this.renderedDiagnosticsRevision) return;
    this.renderedDiagnosticsRevision = revision;
    const presentation = resolveDiagnosticsPresentation(snapshot);
    const status = this.find("[data-diagnostics-status]");
    status.textContent = activeSnapshot?.matchId
      ? `${snapshot?.mapId ?? "未知地图"} · ${snapshot?.players.length ?? 0} 名真人`
      : snapshot?.matchId
        ? `最近完成 · ${snapshot.mapId ?? "未知地图"} · ${snapshot.players.length} 名真人`
        : "等待对局";
    const alerts = this.find("[data-diagnostics-alerts]");
    alerts.textContent = String(presentation.totalAlerts);
    alerts.classList.toggle("is-active", presentation.totalAlerts > 0);
    this.find("[data-diagnostics-server]").innerHTML = snapshot?.server
      ? `<span>服务端步进 P95 <b>${snapshot.server.stepP95Ms.toFixed(1)}ms</b></span><span>最大 <b>${snapshot.server.stepMaxMs.toFixed(1)}ms</b></span><span>追帧上限 <b>${snapshot.server.catchUpLimitHits}</b></span><span>样本 <b>${snapshot.server.acceptedSamples}/${snapshot.server.rejectedSamples}</b></span>`
      : `<span>暂无服务端对局样本</span>`;
    this.find("[data-diagnostics-players]").innerHTML = renderDiagnosticsPlayers(snapshot);
    this.find("[data-diagnostics-reports]").innerHTML = `<div><b>本机最近报告 ${reports.length}/10</b><span><button type="button" data-diagnostics-action="export" ${reports.length ? "" : "disabled"}>导出 JSON</button><button type="button" data-diagnostics-action="clear" ${reports.length ? "" : "disabled"}>清空</button></span></div>${reports.map((report) => `<p><code>${escapeHtml(report.matchId.slice(0, 8))}</code><span>${new Date(report.finishedAt).toLocaleString()} · ${report.mapId} · 告警 ${report.totalAlerts}</span><button type="button" data-diagnostics-action="delete" data-match-id="${escapeHtml(report.matchId)}">删除</button></p>`).join("")}`;
  }

  private presentedPlayer(playerId: string): HostPlayer | undefined {
    const room = this.network.room ?? this.info?.room ?? null;
    return resolveHostPresentation(room, this.network.game).players.find((candidate) => candidate.id === playerId);
  }

  private renderNetworkInfo(): void {
    const network = this.info?.network;
    const stale = this.infoState.stale;
    const status = this.find("#join-network-state");
    const checkedAt = this.find<HTMLTimeElement>("#join-network-check");
    status.textContent = stale
      ? "地址待确认"
      : network
        ? networkStatusName(network.status)
        : "正在检测网络";
    status.classList.toggle("is-offline", stale || network?.status === "unavailable");

    const lastCheck = this.infoState.lastSuccessfulAt ?? network?.checkedAt;
    checkedAt.textContent = lastCheck ? `最近检测 ${new Date(lastCheck).toLocaleTimeString()}` : "";
    checkedAt.dateTime = lastCheck ? new Date(lastCheck).toISOString() : "";

    if (!network) return;
    this.find("#join-url").textContent = network.primaryUrl ?? "当前没有可用的局域网加入地址";
    if (network.revision === this.renderedNetworkRevision) return;

    const qr = this.find<HTMLImageElement>("#join-qr");
    const qrDataUrl = this.info?.qrDataUrls[0];
    if (qrDataUrl) {
      qr.src = qrDataUrl;
      qr.classList.remove("is-loading");
    } else {
      qr.removeAttribute("src");
      qr.classList.add("is-loading");
    }
    this.renderedNetworkRevision = network.revision;
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing host UI element: ${selector}`);
    return element;
  }
}

export function resolveHostPresentation(
  room: RoomSnapshot | null,
  game: GameSnapshot | null,
): { phase: GamePhase; players: HostPlayer[]; matchMode: MatchMode; teamScores: TeamScoreSnapshot[] } {
  if (game) {
    return {
      phase: game.phase,
      players: game.players,
      matchMode: game.matchMode ?? room?.matchMode ?? "solo",
      teamScores: game.teamScores ?? room?.teamScores ?? [],
    };
  }
  return { phase: room?.phase ?? "lobby", players: room?.players ?? [], matchMode: room?.matchMode ?? "solo", teamScores: room?.teamScores ?? [] };
}

export function canUseHostAdmin(phase: GamePhase, token: string): boolean {
  return token.length > 0 && phase !== "finished";
}

export function canEditLobbyRules(phase: GamePhase, token: string): boolean {
  return token.length > 0 && phase === "lobby";
}

function networkStatusName(status: ServerInfo["network"]["status"]): string {
  return ({
    ready: "同一局域网可加入",
    "hotspot-only": "当前仅检测到电脑热点",
    limited: "网络连接受限",
    unavailable: "没有可用的局域网地址",
  } as const)[status];
}

function teamName(teamId: TeamScoreSnapshot["teamId"]): string {
  return teamId === "red" ? "红队" : teamId === "blue" ? "蓝队" : "金队";
}

type HostPlayer = RoomSnapshot["players"][number] & Partial<Pick<GameSnapshot["players"][number], "health" | "maxHealth" | "damage" | "moveSpeed" | "fireCooldownMs">>;

function hostTemplate(): string {
  return `<main class="host-shell">
    <header class="host-header">
      <div class="host-brand"><span class="brand-bolt">E</span><div><span>LAN CONTROL</span><h1>能量乱斗</h1></div></div>
      <span id="host-connection" class="connection-state">正在连接</span>
    </header>
    <section class="host-status-band">
      <div><span>房间状态</span><strong id="host-phase">大厅</strong></div>
      <label class="host-mode-control">模式<select id="host-mode"><option value="solo">个人战</option><option value="team3v3">3v3</option><option value="team2v2v2">2v2v2</option><option value="domination3v3">据点 3v3</option><option value="domination2v2v2">据点 2v2v2</option></select></label>
      <div class="host-map-settings"><label>地图<select id="host-map"><option value="reactor-core">反应堆核心</option><option value="neon-docks">霓虹港区</option><option value="crystal-ruins">晶脉遗迹</option><option value="random">随机轮换</option></select></label><label class="host-map-mechanic-control"><input id="host-map-mechanics" type="checkbox" checked />动态机制</label><label class="host-map-mechanic-control"><input id="host-map-events" type="checkbox" checked />临时事件</label><p id="host-map-mechanic-description">每张地图拥有独立的动态战场机制</p><p id="host-map-event-description">补给、封锁、扫描与风暴会在战斗中轮换</p></div>
      <div><span>真人玩家</span><strong id="host-count">0 / 6</strong></div>
      <div class="host-actions">
        <button id="host-start" class="primary-button" type="button" disabled>开始对局</button>
        <button id="host-end" class="icon-command danger" type="button" disabled title="结束当前对局">■ <span>结束</span></button>
        <button id="host-reset" class="icon-command" type="button" disabled title="返回大厅">↻ <span>重置</span></button>
      </div>
    </section>
    <section class="host-preset-bar" aria-label="房间预设">
      <label>房间预设<select id="host-preset"><option value="">暂无本机预设</option></select></label>
      <button id="host-preset-save" type="button">保存</button><button id="host-preset-apply" type="button">应用</button><button id="host-preset-rename" type="button">重命名</button><button id="host-preset-delete" type="button">删除</button>
      <label>机器人<select id="host-bot-difficulty"><option value="easy">简单</option><option value="normal">标准</option><option value="hard">困难</option></select></label>
    </section>
    <section class="host-main">
      <div class="join-station">
        <span class="eyebrow">PLAYER ENTRY</span><h2>扫码加入战场</h2>
        <img id="join-qr" class="join-qr is-loading" alt="手机加入二维码" />
        <code id="join-url">正在获取局域网地址</code>
        <div class="join-network-status"><span id="join-network-state">正在检测网络</span><time id="join-network-check"></time></div>
      </div>
      <div class="host-roster-panel">
        <div class="section-heading"><span>六席状态</span><small id="host-message"></small></div>
        <div id="host-roster" class="host-roster"></div>
        <div id="host-team-controls" class="host-team-controls"></div>
      </div>
    </section>
    <section class="host-diagnostics" data-diagnostics-root>
      <button class="host-diagnostics-toggle" type="button" aria-expanded="false" data-diagnostics-toggle>
        <span>性能诊断</span><b data-diagnostics-status>等待对局</b><i class="host-diagnostics-alerts" data-diagnostics-alerts>0</i>
      </button>
      <div class="host-diagnostics-body" data-diagnostics-body hidden>
        <div class="host-diagnostics-server" data-diagnostics-server></div>
        <div class="host-diagnostics-table-wrap"><table><thead><tr><th>玩家</th><th>连接</th><th>设备</th><th>网络</th><th>地址</th><th>RTT</th><th>操作 P95</th><th>最长帧</th><th>校正</th></tr></thead><tbody data-diagnostics-players></tbody></table></div>
        <div class="host-diagnostics-reports" data-diagnostics-reports></div>
      </div>
    </section>
    <dialog id="stat-editor" class="stat-editor">
      <form id="stat-form" method="dialog">
        <span class="eyebrow">HOST OVERRIDE</span>
        <h2>修改 <b id="stat-player-name"></b></h2>
        <label>属性<select id="stat-field"><option value="health">当前生命</option><option value="maxHealth">最大生命</option><option value="damage">伤害</option><option value="score">积分</option><option value="moveSpeed">移动速度</option><option value="fireCooldownMs">射击间隔（毫秒）</option><option value="projectileSpeed">子弹飞行速度</option><option value="kills">击杀数</option><option value="energyCollected">能量收集数</option><option value="exclusiveSkillCooldownMs">专属技能冷却（毫秒）</option></select></label>
        <label>新数值<input id="stat-value" type="number" inputmode="numeric" required /></label>
        <p>提交后服务器会立即应用，并同步所有客户端。</p>
        <div><button id="stat-cancel" type="button">取消</button><button class="primary-button" type="submit">应用修改</button></div>
      </form>
    </dialog>
  </main>`;
}

function phaseName(phase: string): string {
  return ({ lobby: "大厅", playing: "对局中", overtime: "加时", finished: "已结束" } as Record<string, string>)[phase] ?? phase;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
