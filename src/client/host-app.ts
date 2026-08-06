import type { AdminStat, GamePhase, GameSnapshot, RoomSnapshot, ServerInfo } from "../shared/protocol";
import { GameNetworkClient } from "./network";

export class HostApp {
  private readonly network = new GameNetworkClient(false);
  private readonly token = new URLSearchParams(window.location.search).get("token") ?? "";
  private info: ServerInfo | null = null;
  private message = "";
  private editingPlayerId: string | null = null;

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
    this.find("#host-roster").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-admin-action]");
      if (!button) return;
      const playerId = button.dataset.playerId;
      const action = button.dataset.adminAction;
      if (!playerId || !action) return;
      if (action === "kick" && window.confirm("确认踢出该玩家？本局将由 AI 接管。")) {
        void this.admin({ type: "kick", playerId });
      } else if (action === "forceWinner" && window.confirm("确认强制该玩家获胜并结束本局？")) {
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
    const player = this.network.game?.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    this.editingPlayerId = playerId;
    this.find("#stat-player-name").textContent = player.nickname;
    this.fillCurrentStatValue();
    this.find<HTMLDialogElement>("#stat-editor").showModal();
  }

  private fillCurrentStatValue(): void {
    const player = this.network.game?.players.find((candidate) => candidate.id === this.editingPlayerId);
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
    this.message = result.ok ? "房主命令已排队" : result.error ?? "房主命令执行失败";
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
    const adminEnabled = this.token.length > 0 && (phase === "playing" || phase === "overtime");
    this.find("#host-roster").innerHTML = Array.from({ length: 6 }, (_, index) => players[index])
      .map((player, index) =>
        player
          ? `<div class="host-seat"><span class="seat-index">${index + 1}</span><i style="--player-color:${player.color}"></i><div class="host-player-name"><b>${escapeHtml(player.nickname)}</b><small>${player.isBot ? "AI" : player.connected ? "在线" : "离线"}</small></div><span class="host-player-stats">生命 ${player.health ?? "—"}/${player.maxHealth ?? "—"} · 伤害 ${player.damage ?? "—"} · 积分 ${player.score} · 移速 ${player.moveSpeed ?? "—"} · 射击 ${player.fireCooldownMs ?? "—"}ms</span><div class="host-player-actions">${adminEnabled ? `<button type="button" data-admin-action="setStat" data-player-id="${player.id}">改数值</button><button type="button" data-admin-action="kick" data-player-id="${player.id}">踢出</button><button type="button" data-admin-action="forceWinner" data-player-id="${player.id}">强制获胜</button>` : ""}</div></div>`
          : `<div class="host-seat is-empty"><span class="seat-index">${index + 1}</span><i></i><b>空位</b><span>等待玩家</span><strong>—</strong></div>`,
      )
      .join("");

    const hasToken = this.token.length > 0;
    this.find<HTMLButtonElement>("#host-start").disabled = !hasToken || !room?.canStart || phase !== "lobby";
    this.find<HTMLButtonElement>("#host-end").disabled = !hasToken || (phase !== "playing" && phase !== "overtime");
    this.find<HTMLButtonElement>("#host-reset").disabled = !hasToken || phase === "lobby";
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
): { phase: GamePhase; players: HostPlayer[] } {
  if (game) {
    return {
      phase: game.phase,
      players: game.players,
    };
  }
  return { phase: room?.phase ?? "lobby", players: room?.players ?? [] };
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
      </div>
    </section>
    <dialog id="stat-editor" class="stat-editor">
      <form id="stat-form" method="dialog">
        <span class="eyebrow">HOST OVERRIDE</span>
        <h2>修改 <b id="stat-player-name"></b></h2>
        <label>属性<select id="stat-field"><option value="health">当前生命</option><option value="maxHealth">最大生命</option><option value="damage">伤害</option><option value="score">积分</option><option value="moveSpeed">移动速度</option><option value="fireCooldownMs">射击间隔（毫秒）</option></select></label>
        <label>新数值<input id="stat-value" type="number" inputmode="numeric" required /></label>
        <p>提交后服务器会在下一固定帧应用，并立即同步所有客户端。</p>
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
