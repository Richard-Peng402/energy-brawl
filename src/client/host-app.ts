import type { ServerInfo } from "../shared/protocol";
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

  private render(): void {
    const room = this.network.room ?? this.info?.room;
    this.find("#host-connection").textContent = this.network.connected ? "服务器在线" : "正在连接";
    this.find("#host-connection").classList.toggle("is-offline", !this.network.connected);
    this.find("#host-phase").textContent = phaseName(room?.phase ?? "lobby");
    this.find("#host-count").textContent = `${room?.players.filter((player) => !player.isBot).length ?? 0} / 6`;
    this.find("#host-message").textContent = this.token ? this.message : "主机令牌缺失，请从服务器启动窗口打开此页面";

    const joinUrl = this.info?.joinUrls[0] ?? "正在获取局域网地址";
    this.find("#join-url").textContent = joinUrl;
    const qr = this.find<HTMLImageElement>("#join-qr");
    if (this.info?.qrDataUrls[0]) {
      qr.src = this.info.qrDataUrls[0];
      qr.classList.remove("is-loading");
    }

    const players = room?.players ?? [];
    this.find("#host-roster").innerHTML = Array.from({ length: 6 }, (_, index) => players[index])
      .map((player, index) =>
        player
          ? `<div class="host-seat"><span class="seat-index">${index + 1}</span><i style="--player-color:${player.color}"></i><b>${escapeHtml(player.nickname)}</b><span>${player.isBot ? "AI" : player.ready ? "已准备" : player.connected ? "未准备" : "离线"}</span><strong>${player.score}</strong></div>`
          : `<div class="host-seat is-empty"><span class="seat-index">${index + 1}</span><i></i><b>空位</b><span>等待玩家</span><strong>—</strong></div>`,
      )
      .join("");

    const phase = room?.phase ?? "lobby";
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
