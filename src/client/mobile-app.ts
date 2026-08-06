import { CHARACTER_CATALOG, type CharacterId } from "../shared/character-catalog";
import { LOBBY_RETURN_DELAY_MS, TARGET_SCORE } from "../shared/constants";
import { SKILL_CATALOG, type SkillType } from "../shared/skill-catalog";
import type { GameSnapshot, PlayerSnapshot } from "../shared/protocol";
import { CHARACTER_ASSETS, SKILL_ICON_ASSETS } from "./asset-registry";
import { CombatAudio } from "./combat-audio";
import { didPickUpLocalSkill } from "./combat-feedback";
import { GameRenderer } from "./game-scene";
import { buildCharacterSelection, GameNetworkClient } from "./network";
import { MobileViewport } from "./mobile-viewport";
import { skillUseBlockReason } from "./skill-use";
import { TouchRouter } from "./touch-router";
import { VirtualStick } from "./virtual-stick";

const NAME_KEY = "energy-brawl.nickname";

export class MobileApp {
  private readonly network = new GameNetworkClient(true);
  private readonly moveStick: VirtualStick;
  private readonly aimStick: VirtualStick;
  private readonly touchRouter: TouchRouter;
  private readonly viewport: MobileViewport;
  private readonly audio = new CombatAudio(window.localStorage);
  private renderer: GameRenderer | null = null;
  private selectedCharacterId: CharacterId = CHARACTER_CATALOG[0]!.id;
  private inputSequence = 0;
  private skillActionSequence = 0;
  private lastSkillType: SkillType | null | undefined = undefined;
  private lastInputSentAt = 0;
  private acceptingInput = false;
  private toastTimer = 0;
  private lastFrameAt = 0;
  private hintWindowAt = 0;
  private frameIntervals: number[] = [];
  private slowFrameWindows = 0;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = mobileTemplate();
    const arena = this.find("#arena-screen");
    this.moveStick = new VirtualStick(arena, this.find("#move-stick"), 64, false);
    this.aimStick = new VirtualStick(arena, this.find("#aim-stick"), 64, false);
    this.touchRouter = new TouchRouter(
      this.moveStick,
      this.aimStick,
      () => arena.getBoundingClientRect().width || window.innerWidth,
      this.useSkill,
    );
    this.viewport = new MobileViewport(this.resetControls);
    this.viewport.start();
    this.bindActions();
    this.bindArenaGestures();
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
      const result = await this.network.join({ nickname: value, characterId: this.selectedCharacterId });
      if (result.ok) {
        localStorage.setItem(NAME_KEY, value);
      } else {
        this.showToast(result.error ?? "加入失败");
      }
    });

    this.find("#color-list").addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-character-id]");
      if (!target || target.disabled) return;
      this.selectedCharacterId = (target.dataset.characterId as CharacterId | undefined) ?? CHARACTER_CATALOG[0]!.id;
      this.renderColors();
    });

    this.find("#ready-button").addEventListener("click", async () => {
      const ownSeat = this.network.room?.players.find((player) => player.id === this.network.playerId);
      const result = await this.network.setReady(!ownSeat?.ready);
      if (!result.ok) this.showToast(result.error ?? "无法修改准备状态");
    });
    this.find<HTMLButtonElement>("#return-lobby").addEventListener("click", async () => {
      const result = await this.network.returnToLobby();
      if (!result.ok) this.showToast(result.error ?? "无法返回大厅");
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-fullscreen]")) {
      button.addEventListener("click", async () => {
        const entered = await this.viewport.requestFullscreen();
        if (!entered) this.showToast("当前浏览器将使用沉浸式横屏布局");
      });
    }
  }

  private bindArenaGestures(): void {
    const arena = this.find("#arena-screen");
    arena.addEventListener("pointerdown", (event) => {
      const target = event.target as HTMLElement;
      const role = this.touchRouter.pointerDown(event, Boolean(target.closest?.("[data-skill-button]")));
      if (role && arena.setPointerCapture) arena.setPointerCapture(event.pointerId);
    });
    arena.addEventListener("pointermove", (event) => this.touchRouter.pointerMove(event));
    const release = (event: PointerEvent) => {
      this.touchRouter.pointerUp(event.pointerId);
      if (arena.hasPointerCapture?.(event.pointerId)) arena.releasePointerCapture(event.pointerId);
    };
    arena.addEventListener("pointerup", release);
    arena.addEventListener("pointercancel", release);
    arena.addEventListener("lostpointercapture", (event) => this.touchRouter.pointerUp(event.pointerId));
    arena.addEventListener("gesturestart", (event) => event.preventDefault());
    arena.addEventListener("dblclick", (event) => event.preventDefault());
    let lastTouchEndAt = 0;
    arena.addEventListener("touchend", (event) => {
      const now = performance.now();
      if (now - lastTouchEndAt < 300) event.preventDefault();
      lastTouchEndAt = now;
    }, { passive: false });
  }

  private render(): void {
    this.renderConnection();
    this.renderColors();
    this.renderRoster();

    if (!this.network.playerSessionReady) {
      this.renderer?.resetLocalInputs();
      this.acceptingInput = false;
      this.lastInputSentAt = 0;
    }

    const phase = this.network.room?.phase ?? "lobby";
    const inGame = phase === "playing" || phase === "overtime" || phase === "finished";
    this.find("#lobby-screen").classList.toggle("is-hidden", inGame);
    this.find("#arena-screen").classList.toggle("is-hidden", !inGame);

    if (inGame && this.network.game) {
      this.ensureRenderer();
      this.renderer?.setLocalPlayerId(this.network.playerId);
      this.renderer?.setSnapshotMode(this.network.snapshotMode);
      this.renderer?.setSnapshot(this.network.game);
      this.renderHud(this.network.game);
      this.renderResults(this.network.game);
    } else {
      this.find("#results-overlay").classList.add("is-hidden");
      this.skillActionSequence = 0;
      this.lastSkillType = undefined;
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
    const ownSeat = this.network.room?.players.find((player) => player.id === this.network.playerId);
    if (ownSeat) this.selectedCharacterId = ownSeat.characterId;
    const cards = buildCharacterSelection(this.network.room, this.network.playerId, this.selectedCharacterId);
    this.find("#color-list").innerHTML = cards.map((character) => {
      const unavailable = character.unavailable || Boolean(ownSeat && ownSeat.characterId !== character.id);
      return `<button class="color-swatch character-card${character.selected ? " is-selected" : ""}" type="button" data-character-id="${character.id}" style="--swatch:${character.color}" aria-label="选择${character.name}" aria-pressed="${character.selected}" ${unavailable ? "disabled" : ""}>
        <span class="character-portrait"><img src="${CHARACTER_ASSETS[character.id].portrait}" data-character-fallback="${CHARACTER_ASSETS[character.id].fallback}" alt="" /></span>
        <span class="character-card-copy"><strong>${character.name}</strong><small>${character.role}</small></span>
        ${character.unavailable ? '<span class="character-lock">已占用</span>' : ""}
      </button>`;
    }).join("");
    for (const image of this.root.querySelectorAll<HTMLImageElement>("[data-character-fallback]")) {
      image.addEventListener("error", () => {
        const fallback = image.dataset.characterFallback;
        if (fallback && image.src !== new URL(fallback, window.location.href).href) image.src = fallback;
        else image.hidden = true;
      }, { once: true });
    }
    const selected = cards.find((character) => character.id === this.selectedCharacterId) ?? cards[0]!;
    this.find("#character-detail").innerHTML = `<div class="character-detail-heading"><div><strong>${selected.name}</strong><span>${selected.role}</span></div><p><b>${selected.passiveName}</b> · ${selected.passiveDescription}</p></div>
      <div class="character-traits"><span class="trait-good">优势 ${selected.advantage}</span><span class="trait-cost">代价 ${selected.tradeoff}</span></div>
      <div class="character-stats" aria-label="${selected.name}精确数值"><span>生命 <b>${selected.maxHealth}</b></span><span>伤害 <b>${selected.damage}</b></span><span>移速 <b>${selected.moveSpeed}</b></span><span>射速 <b>${selected.fireCooldownMs}ms</b></span><span>弹速 <b>${selected.projectileSpeed}</b></span></div>`;
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
    this.find("#health-value").textContent = own?.alive ? `${Math.ceil(own.health)}` : "0";
    this.find("#target-score").textContent = `${TARGET_SCORE}`;
    const holder = snapshot.holderId ? snapshot.players.find((player) => player.id === snapshot.holderId) : null;
    this.find("#match-clock").textContent = holder && snapshot.holdRemainingMs !== null
      ? `${holder.nickname} ${Math.ceil(snapshot.holdRemainingMs / 1_000)}s`
      : snapshot.phase === "overtime" ? "加时" : formatTime(snapshot.remainingMs);
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
    this.renderSkillButton(own);
  }

  private renderSkillButton(player: PlayerSnapshot | undefined): void {
    const button = this.find<HTMLButtonElement>("#skill-button");
    const type = player?.skillSlot.charges === 1 ? player.skillSlot.type : null;
    button.classList.toggle("is-ready", Boolean(type));
    button.setAttribute("aria-disabled", String(!type));
    if (this.lastSkillType === type) return;
    const previous = this.lastSkillType;
    this.lastSkillType = type;
    button.dataset.skillType = type ?? "empty";
    button.innerHTML = type
      ? `<img src="${SKILL_ICON_ASSETS[type]}" alt="" /><span><b>${SKILL_CATALOG[type].name}</b><small>一次</small></span>`
      : `<span class="skill-empty-mark">◇</span><span><b>技能槽</b><small>等待拾取</small></span>`;
    button.setAttribute("aria-label", type ? `使用${SKILL_CATALOG[type].name}` : "技能槽为空");
    if (didPickUpLocalSkill(previous, type)) this.audio.playPickup();
    if (type && previous !== type) this.showToast(`获得技能：${SKILL_CATALOG[type].name}`);
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
    const countdown = Math.max(0, (snapshot.finishedAt ?? snapshot.serverTime) + LOBBY_RETURN_DELAY_MS - snapshot.serverTime);
    this.find("#return-countdown").textContent = `${Math.ceil(countdown / 1_000)}s 后自动回大厅`;
  }

  private ensureRenderer(): void {
    if (!this.renderer) this.renderer = new GameRenderer(this.find("#game-root"), this.network.playerId, this.audio);
  }

  private readonly inputLoop = (time: number): void => {
    if (this.lastFrameAt > 0) {
      this.frameIntervals.push(time - this.lastFrameAt);
      if (this.frameIntervals.length > 120) this.frameIntervals.shift();
    }
    this.lastFrameAt = time;
    if (time - this.hintWindowAt >= 2_000 && this.frameIntervals.length >= 20) {
      const sorted = [...this.frameIntervals].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
      if (p95 > 24) this.slowFrameWindows += 1;
      else this.slowFrameWindows = 0;
      this.network.sendPerformanceHint({ snapshotMode: this.slowFrameWindows >= 2 ? "reduced" : "full", frameP95Ms: p95 });
      this.hintWindowAt = time;
      this.frameIntervals = [];
    }
    const ownSeat = this.network.room?.players.find((player) => player.id === this.network.playerId);
    const activePhase = this.network.game?.phase === "playing" || this.network.game?.phase === "overtime";
    const acceptingInput = this.network.connected && this.network.playerSessionReady && ownSeat?.connected === true && ownSeat.isBot === false && activePhase;
    if (acceptingInput) {
      const move = this.moveStick.getValue();
      const aim = this.aimStick.getValue();
      this.renderer?.setLocalInput(move);
      this.renderer?.setLocalAim(aim);
      if (time - this.lastInputSentAt >= 33) {
        const input = {
          seq: ++this.inputSequence,
          moveX: move.x,
          moveY: move.y,
          aimX: aim.x,
          aimY: aim.y,
          firing: aim.magnitude > 0.15,
        };
        const deltaMs = this.lastInputSentAt > 0 ? Math.min(100, time - this.lastInputSentAt) : 33;
        this.renderer?.addLocalInput(input, deltaMs);
        this.network.sendInput(input);
        this.lastInputSentAt = time;
      }
    } else {
      if (this.acceptingInput) this.renderer?.resetLocalInputs();
      this.lastInputSentAt = 0;
      this.renderer?.setLocalInput({ x: 0, y: 0 });
      this.renderer?.setLocalAim({ x: 0, y: 0 });
    }
    this.acceptingInput = acceptingInput;
    requestAnimationFrame(this.inputLoop);
  };

  private readonly resetControls = (): void => {
    this.touchRouter.resetAll();
    this.renderer?.resetLocalInputs();
    this.renderer?.setLocalInput({ x: 0, y: 0 });
    this.renderer?.setLocalAim({ x: 0, y: 0 });
  };

  private readonly useSkill = (): void => {
    const own = this.network.game?.players.find((player) => player.id === this.network.playerId);
    if (!this.acceptingInput) {
      this.showToast("暂时无法使用技能");
      return;
    }
    if (!own) {
      this.showToast("等待玩家状态");
      return;
    }
    const blockReason = skillUseBlockReason(own);
    if (blockReason) {
      this.showToast(blockReason);
      return;
    }
    this.skillActionSequence = Math.max(this.skillActionSequence, own.lastProcessedSkillAction) + 1;
    this.network.sendSkillAction(this.skillActionSequence);
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
        <div class="header-actions"><button class="fullscreen-button" data-fullscreen type="button">全屏</button><span id="connection-state" class="connection-state">正在连接</span></div>
      </header>

      <section id="lobby-screen" class="lobby-screen">
        <div class="lobby-intro">
          <span class="eyebrow">LAN ARENA · 6 PLAYERS</span>
          <h1>能量乱斗</h1>
          <p id="lobby-status">正在连接房间</p>
        </div>
        <div class="lobby-workspace">
          <section class="character-panel">
            <div class="section-heading"><span>选择角色</span><small>每名真人角色唯一 · AI 不锁定</small></div>
            <div id="color-list" class="color-list"></div>
            <div id="character-detail" class="character-detail"></div>
          </section>
          <form id="join-form" class="join-panel">
            <label for="nickname">你的昵称</label>
            <input id="nickname" maxlength="12" autocomplete="nickname" placeholder="输入昵称" required />
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
          <button class="fullscreen-button arena-fullscreen" data-fullscreen type="button">全屏</button>
          <div id="respawn-state" class="respawn-state is-hidden"></div>
        </div>
        <div class="control-layer">
          <button id="skill-button" class="skill-button" data-skill-button data-skill-type="empty" type="button" aria-label="技能槽为空" aria-disabled="true"><span class="skill-empty-mark">◇</span><span><b>技能槽</b><small>等待拾取</small></span></button>
          <div id="move-stick" class="virtual-stick move-stick"><div class="stick-mark">MOVE</div><div class="stick-knob"></div></div>
          <div id="aim-stick" class="virtual-stick aim-stick"><div class="stick-mark">FIRE</div><div class="stick-knob"></div></div>
        </div>
        <div id="results-overlay" class="results-overlay is-hidden">
          <div class="results-panel"><span class="eyebrow">MATCH COMPLETE</span><h2 id="result-title">本局结束</h2><div id="result-list" class="result-list"></div><p id="return-countdown"></p><button id="return-lobby" class="primary-button" type="button">返回大厅</button></div>
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
