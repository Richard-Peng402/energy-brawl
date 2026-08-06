import type { AdminStat, GamePhase, GameSnapshot, RoomSnapshot, ServerInfo } from "../shared/protocol";
import { GameNetworkClient } from "./network";

export class HostApp {
  private readonly network = new GameNetworkClient(false);
  private readonly token = new URLSearchParams(window.location.search).get("token") ?? "";
  private info: ServerInfo | null = null;
  private message = "";

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
        const stat = window.prompt("输入要修改的字段：health / maxHealth / damage / score / moveSpeed / fireCooldownMs", "health") as AdminStat | null;
        if (!stat || !["health", "maxHealth", "damage", "score", "moveSpeed", "fireCooldownMs"].includes(stat)) return;
        const value = Number(window.prompt(`输入 ${stat} 的新值（服务器会检查安全范围）`, ""));
        if (Number.isFinite(value)) void this.admin({ type: "setStat", playerId, stat, value });
      }
    });
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
  </main>`;
}

function phaseName(phase: string): string {
  return ({ lobby: "大厅", playing: "对局中", overtime: "加时", finished: "已结束" } as Record<string, string>)[phase] ?? phase;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
