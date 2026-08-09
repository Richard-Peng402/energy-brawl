import type { MatchMode } from "../shared/mode-catalog";
import type { AdminStat, GamePhase, GameSnapshot, RoomSnapshot, ServerInfo, TeamScoreSnapshot } from "../shared/protocol";
import { GameNetworkClient } from "./network";

export class HostApp {
  private readonly network = new GameNetworkClient(false);
  private readonly token = new URLSearchParams(window.location.search).get("token") ?? "";
  private info: ServerInfo | null = null;
  private message = "";
  private editingPlayerId: string | null = null;
  private selectedSwapPlayerId: string | null = null;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = hostTemplate();
    this.bindActions();
    this.network.subscribe(() => this.render());
    void this.loadInfo();
  }

  private bindActions(): void {
    this.find("#host-start").addEventListener("click", () => void this.command("start"));
    this.find("#host-end").addEventListener("click", () => void this.command("end"));
    this.find("#host-reset").addEventListener("click", () => void this.command("reset"));
    this.find<HTMLSelectElement>("#host-mode").addEventListener("change", (event) => {
      void this.admin({ type: "setMode", mode: (event.target as HTMLSelectElement).value as MatchMode });
    });
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

  private async loadInfo(): Promise<void> {
    try {
      const response = await fetch("/api/info");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.info = (await response.json()) as ServerInfo;
    } catch {
      this.message = "无法读取服务器信息";
    }
    this.render();
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
    if (this.info?.qrDataUrls[0]) {
      qr.src = this.info.qrDataUrls[0];
      qr.classList.remove("is-loading");
    }

    const players = presentation.players;
    const phase = presentation.phase;
    const adminEnabled = canUseHostAdmin(phase, this.token);
    const pendingWinnerId = room?.pendingWinnerId ?? null;
    const lobbyRulesEnabled = canEditLobbyRules(phase, this.token);
    const modeSelect = this.find<HTMLSelectElement>("#host-mode");
    modeSelect.value = presentation.matchMode;
    modeSelect.disabled = !lobbyRulesEnabled;
    this.find("#host-team-controls").innerHTML = presentation.matchMode === "solo"
      ? ""
      : presentation.teamScores.map((team) => {
          const members = players.filter((player) => player.teamId === team.teamId);
          return `<div class="host-team-card"><b>${teamName(team.teamId)} ${team.score}/${team.targetScore}</b><div>${members.map((player) => `<button type="button" data-team-action="swap" data-player-id="${player.id}" ${lobbyRulesEnabled ? "" : "disabled"}>${escapeHtml(player.nickname)}</button>`).join("")}</div><button type="button" data-team-action="forceWinner" data-team-id="${team.teamId}" ${adminEnabled ? "" : "disabled"}>强制本队获胜</button></div>`;
        }).join("");
    this.find("#host-roster").innerHTML = Array.from({ length: 6 }, (_, index) => players[index])
      .map((player, index) =>
        player
          ? `<div class="host-seat${pendingWinnerId === player.id ? " is-preset-winner" : ""}"><span class="seat-index">${index + 1}</span><i style="--player-color:${player.color}"></i><div class="host-player-name"><b>${escapeHtml(player.nickname)}</b><small>${pendingWinnerId === player.id ? "已预设胜者" : player.isBot ? "AI" : player.connected ? "在线" : "离线"}</small></div><span class="host-player-stats">生命 ${player.health}/${player.maxHealth} · 伤害 ${player.damage} · 积分 ${player.score} · 击杀 ${player.kills} · 能量 ${player.energyCollected} · 移速 ${player.moveSpeed} · 弹速 ${player.projectileSpeed} · 射击 ${player.fireCooldownMs}ms</span><div class="host-player-actions">${adminEnabled ? `<button type="button" data-admin-action="setStat" data-player-id="${player.id}">改数值</button><button type="button" data-admin-action="kick" data-player-id="${player.id}">踢出</button><button type="button" data-admin-action="forceWinner" data-player-id="${player.id}">${phase === "lobby" ? "预设获胜" : "强制获胜"}</button>` : ""}</div></div>`
          : `<div class="host-seat is-empty"><span class="seat-index">${index + 1}</span><i></i><b>空位</b><span>等待玩家</span><strong>—</strong></div>`,
      )
      .join("");

    const hasToken = this.token.length > 0;
    this.find<HTMLButtonElement>("#host-start").disabled = !hasToken || !room?.canStart || phase !== "lobby";
    this.find<HTMLButtonElement>("#host-end").disabled = !hasToken || (phase !== "playing" && phase !== "overtime");
    this.find<HTMLButtonElement>("#host-reset").disabled = !hasToken || phase === "lobby";
  }

  private presentedPlayer(playerId: string): HostPlayer | undefined {
    const room = this.network.room ?? this.info?.room ?? null;
    return resolveHostPresentation(room, this.network.game).players.find((candidate) => candidate.id === playerId);
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
      <div><span>真人玩家</span><strong id="host-count">0 / 6</strong></div>
      <div class="host-actions">
        <button id="host-start" class="primary-button" type="button" disabled>开始对局</button>
        <button id="host-end" class="icon-command danger" type="button" disabled title="结束当前对局">■ <span>结束</span></button>
        <button id="host-reset" class="icon-command" type="button" disabled title="返回大厅">↻ <span>重置</span></button>
      </div>
    </section>
    <section class="host-main">
      <div class="join-station">
        <span class="eyebrow">PLAYER ENTRY</span><h2>扫码加入战场</h2>
        <img id="join-qr" class="join-qr is-loading" alt="手机加入二维码" />
        <code id="join-url">正在获取局域网地址</code>
      </div>
      <div class="host-roster-panel">
        <div class="section-heading"><span>六席状态</span><small id="host-message"></small></div>
        <div id="host-roster" class="host-roster"></div>
        <div id="host-team-controls" class="host-team-controls"></div>
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
