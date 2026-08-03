import { PLAYER_COLORS, TARGET_SCORE } from "../shared/constants";
import type { GameSnapshot, PlayerSnapshot } from "../shared/protocol";
import { GameRenderer } from "./game-scene";
import { GameNetworkClient } from "./network";
import { VirtualStick } from "./virtual-stick";

const NAME_KEY = "energy-brawl.nickname";

export class MobileApp {
  private readonly network = new GameNetworkClient(true);
  private readonly moveStick: VirtualStick;
  private readonly aimStick: VirtualStick;
  private renderer: GameRenderer | null = null;
  private selectedColor: string = PLAYER_COLORS[0];
  private inputSequence = 0;
  private lastInputSentAt = 0;
  private toastTimer = 0;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = mobileTemplate();
    this.moveStick = new VirtualStick(this.find("#move-stick"));
    this.aimStick = new VirtualStick(this.find("#aim-stick"));
    this.bindActions();
    this.network.subscribe(() => this.render());
    requestAnimationFrame(this.inputLoop);
  }

  private bindActions(): void {
    const form = this.find<HTMLFormElement>("#join-form");
    const nickname = this.find<HTMLInputElement>("#nickname");
    nickname.value = localStorage.getItem(NAME_KEY) ?? "";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = nickname.value.trim();
      const result = await this.network.join({ nickname: value, color: this.selectedColor });
      if (result.ok) {
        localStorage.setItem(NAME_KEY, value);
      } else {
        this.showToast(result.error ?? "加入失败");
      }
    });

    this.find("#color-list").addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-color]");
      if (!target || target.disabled) return;
      this.selectedColor = target.dataset.color ?? PLAYER_COLORS[0];
      this.renderColors();
    });

    this.find("#ready-button").addEventListener("click", async () => {
      const ownSeat = this.network.room?.players.find((player) => player.id === this.network.playerId);
      const result = await this.network.setReady(!ownSeat?.ready);
      if (!result.ok) this.showToast(result.error ?? "无法修改准备状态");
    });
  }

  private render(): void {
    this.renderConnection();
    this.renderColors();
    this.renderRoster();

    const phase = this.network.room?.phase ?? "lobby";
    const inGame = phase === "playing" || phase === "overtime" || phase === "finished";
    this.find("#lobby-screen").classList.toggle("is-hidden", inGame);
    this.find("#arena-screen").classList.toggle("is-hidden", !inGame);

    if (inGame && this.network.game) {
      this.ensureRenderer();
      this.renderer?.setLocalPlayerId(this.network.playerId);
      this.renderer?.setSnapshot(this.network.game);
      this.renderHud(this.network.game);
      this.renderResults(this.network.game);
    } else {
      this.find("#results-overlay").classList.add("is-hidden");
      if (this.renderer) {
        this.renderer.destroy();
        this.renderer = null;
      }
    }

    if (this.network.notice) this.showToast(this.network.notice);
  }

  private renderConnection(): void {
    const element = this.find("#connection-state");
    element.textContent = this.network.connected ? "局域网已连接" : "正在重连";
    element.classList.toggle("is-offline", !this.network.connected);
  }

  private renderColors(): void {
    const used = new Set(this.network.room?.players.map((player) => player.color) ?? []);
    const ownColor = this.network.room?.players.find((player) => player.id === this.network.playerId)?.color;
    this.find("#color-list").innerHTML = PLAYER_COLORS.map((color) => {
      const unavailable = used.has(color) && ownColor !== color;
      const selected = this.selectedColor === color;
      return `<button class="color-swatch${selected ? " is-selected" : ""}" type="button" data-color="${color}" style="--swatch:${color}" aria-label="选择颜色" ${unavailable ? "disabled" : ""}></button>`;
    }).join("");
  }

  private renderRoster(): void {
    const room = this.network.room;
    const players = room?.players ?? [];
    const slots = Array.from({ length: 6 }, (_, index) => players[index]);
    this.find("#roster").innerHTML = slots
      .map((player, index) =>
        player
          ? `<div class="roster-slot${player.id === this.network.playerId ? " is-you" : ""}">
              <span class="player-dot" style="--player-color:${player.color}"></span>
              <span class="roster-name">${escapeHtml(player.nickname)}</span>
              <span class="roster-status">${player.isBot ? "AI" : player.ready ? "已准备" : player.connected ? "未准备" : "离线"}</span>
            </div>`
          : `<div class="roster-slot is-empty"><span class="slot-number">${index + 1}</span><span class="roster-name">等待加入</span><span class="roster-status">空位</span></div>`,
      )
      .join("");

    const ownSeat = players.find((player) => player.id === this.network.playerId);
    const hasJoined = Boolean(ownSeat);
    this.find("#join-form").classList.toggle("is-hidden", hasJoined);
    const readyButton = this.find<HTMLButtonElement>("#ready-button");
    readyButton.classList.toggle("is-hidden", !hasJoined);
    readyButton.textContent = ownSeat?.ready ? "取消准备" : "准备";
    readyButton.classList.toggle("is-ready", ownSeat?.ready === true);
    this.find("#lobby-status").textContent = room?.canStart
      ? "全员就绪，等待主机开局"
      : hasJoined
        ? "等待其他玩家"
        : "选择身份加入房间";
  }

  private renderHud(snapshot: GameSnapshot): void {
    const own = snapshot.players.find((player) => player.id === this.network.playerId);
    const leaders = [...snapshot.players].sort((a, b) => b.score - a.score || b.kills - a.kills);
    this.find("#own-score").textContent = `${own?.score ?? 0}`;
    this.find<HTMLElement>("#health-fill").style.width = `${own ? (own.health / own.maxHealth) * 100 : 0}%`;
    this.find("#health-value").textContent = own?.alive ? `${own.health}` : "0";
    this.find("#target-score").textContent = `${TARGET_SCORE}`;
    this.find("#match-clock").textContent = snapshot.phase === "overtime" ? "加时" : formatTime(snapshot.remainingMs);
    this.find("#leaderboard").innerHTML = leaders
      .slice(0, 4)
      .map(
        (player, index) => `<div class="leader-row${player.id === this.network.playerId ? " is-you" : ""}">
          <span>${index + 1}</span><i style="--player-color:${player.color}"></i><b>${escapeHtml(player.nickname)}</b><strong>${player.score}</strong>
        </div>`,
      )
      .join("");
    const respawn = this.find("#respawn-state");
    const remaining = own?.respawnAt ? Math.max(0, own.respawnAt - snapshot.serverTime) : 0;
    respawn.textContent = own && !own.alive ? `${Math.ceil(remaining / 1_000)} 秒后重返战场` : "";
    respawn.classList.toggle("is-hidden", own?.alive !== false);
  }

  private renderResults(snapshot: GameSnapshot): void {
    const overlay = this.find("#results-overlay");
    const finished = snapshot.phase === "finished";
    overlay.classList.toggle("is-hidden", !finished);
    if (!finished) return;
    const ranking = [...snapshot.players].sort((a, b) => b.score - a.score || b.kills - a.kills);
    const winner = ranking[0];
    this.find("#result-title").textContent = winner?.id === this.network.playerId ? "你赢了" : `${winner?.nickname ?? "本局"} 获胜`;
    this.find("#result-list").innerHTML = ranking
      .map(
        (player, index) => `<div class="result-row${player.id === this.network.playerId ? " is-you" : ""}">
          <span class="result-rank">${index + 1}</span><i style="--player-color:${player.color}"></i>
          <b>${escapeHtml(player.nickname)}</b><span>${player.kills} 击败</span><span>${player.energyCollected} 能量</span><strong>${player.score}</strong>
        </div>`,
      )
      .join("");
  }

  private ensureRenderer(): void {
    if (!this.renderer) this.renderer = new GameRenderer(this.find("#game-root"), this.network.playerId);
  }

  private readonly inputLoop = (time: number): void => {
    if (time - this.lastInputSentAt >= 33 && (this.network.game?.phase === "playing" || this.network.game?.phase === "overtime")) {
      const move = this.moveStick.getValue();
      const aim = this.aimStick.getValue();
      this.network.sendInput({
        seq: ++this.inputSequence,
        moveX: move.x,
        moveY: move.y,
        aimX: aim.x,
        aimY: aim.y,
        firing: aim.magnitude > 0.15,
      });
      this.lastInputSentAt = time;
    }
    requestAnimationFrame(this.inputLoop);
  };

  private showToast(message: string): void {
    const toast = this.find("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2_400);
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing mobile UI element: ${selector}`);
    return element;
  }
}

function mobileTemplate(): string {
  return `
    <div class="orientation-gate"><div class="rotate-icon">↻</div><strong>请横屏进入战场</strong></div>
    <main class="mobile-shell">
      <header class="game-header">
        <div class="mini-brand"><span class="brand-bolt">E</span><strong>能量乱斗</strong></div>
        <span id="connection-state" class="connection-state">正在连接</span>
      </header>

      <section id="lobby-screen" class="lobby-screen">
        <div class="lobby-intro">
          <span class="eyebrow">LAN ARENA · 6 PLAYERS</span>
          <h1>能量乱斗</h1>
          <p id="lobby-status">正在连接房间</p>
        </div>
        <div class="lobby-workspace">
          <form id="join-form" class="join-panel">
            <label for="nickname">你的昵称</label>
            <input id="nickname" maxlength="12" autocomplete="nickname" placeholder="输入昵称" required />
            <span class="field-label">战斗颜色</span>
            <div id="color-list" class="color-list"></div>
            <button class="primary-button" type="submit">加入房间</button>
          </form>
          <div class="roster-panel">
            <div class="section-heading"><span>参战席位</span><small>空位由 AI 补齐</small></div>
            <div id="roster" class="roster-grid"></div>
            <button id="ready-button" class="ready-button is-hidden" type="button">准备</button>
          </div>
        </div>
      </section>

      <section id="arena-screen" class="arena-screen is-hidden">
        <div id="game-root" class="game-root"></div>
        <div class="hud-layer">
          <div class="self-status">
            <div class="health-line"><span>HP</span><div class="health-track"><i id="health-fill"></i></div><strong id="health-value">100</strong></div>
            <div class="score-line"><span>积分</span><strong id="own-score">0</strong><small>/ <span id="target-score">15</span></small></div>
          </div>
          <div id="match-clock" class="match-clock">5:00</div>
          <div id="leaderboard" class="leaderboard"></div>
          <div id="respawn-state" class="respawn-state is-hidden"></div>
        </div>
        <div class="control-layer">
          <div id="move-stick" class="virtual-stick move-stick" aria-label="移动摇杆"><div class="stick-mark">MOVE</div><div class="stick-knob"></div></div>
          <div id="aim-stick" class="virtual-stick aim-stick" aria-label="瞄准摇杆"><div class="stick-mark">FIRE</div><div class="stick-knob"></div></div>
        </div>
        <div id="results-overlay" class="results-overlay is-hidden">
          <div class="results-panel"><span class="eyebrow">MATCH COMPLETE</span><h2 id="result-title">本局结束</h2><div id="result-list" class="result-list"></div><p>等待主机开启下一局</p></div>
        </div>
      </section>
      <div id="toast" class="toast" role="status"></div>
    </main>`;
}

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
