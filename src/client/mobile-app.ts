import { CHARACTER_CATALOG, type CharacterId } from "../shared/character-catalog";
import { LOBBY_RETURN_DELAY_MS, TARGET_SCORE } from "../shared/constants";
import { SKILL_CATALOG, type SkillType } from "../shared/skill-catalog";
import { getExclusiveSkill } from "../shared/exclusive-skill-catalog";
import type { MapId } from "../shared/map-catalog";
import type { GameSnapshot, PlayerSnapshot } from "../shared/protocol";
import { CHARACTER_ASSETS, CHARACTER_SELECTION_ASSETS, EXCLUSIVE_SKILL_ICON_ASSETS, SKILL_ICON_ASSETS } from "./asset-registry";
import { CombatAudio } from "./combat-audio";
import { didPickUpLocalSkill, selectLatestKillFeedback, type CombatFeedbackEvent } from "./combat-feedback";
import { CombatHaptics, type HapticsMode } from "./combat-haptics";
import { ClientDiagnosticsCollector } from "./diagnostics-collector";
import { collectDeviceProfile, type DeviceProfileNavigator } from "./device-profile";
import { GameRenderer } from "./game-scene";
import { buildCharacterSelection, GameNetworkClient, isCharacterSelectionDisabled } from "./network";
import { MobileViewport } from "./mobile-viewport";
import { capturePointRevision, gameLeaderboardRevision, roomUiRevision } from "./render-throttle";
import { canPressExclusiveSkill, exclusiveSkillButtonMode } from "./exclusive-skill-ui";
import { getSkillIndicatorProfile, SkillIndicatorController, type SkillIndicatorSkill } from "./skill-indicator";
import {
  CONTROL_ACTION_LABELS,
  CONTROL_ACTIONS,
  DEFAULT_CONTROL_SETTINGS,
  formatKeyCode,
  loadControlSettings,
  normalizeControlSettings,
  resolveKeyboardControl,
  saveControlSettings,
  type ControlAction,
  type ControlSettings,
} from "./control-settings";
import { isDisplacementSkill, resolveSkillStickDirection } from "./skill-direction-control";
import { skillUseBlockReason } from "./skill-use";
import { moveTouchControl, touchControlStyle, type MovableTouchControl } from "./touch-control-layout";
import { TouchRouter } from "./touch-router";
import { VirtualStick } from "./virtual-stick";
import { CHARACTER_PREVIEW_CLASSES, getCharacterPreviewMotion } from "./character-preview";
import { resolveHeldSkillAim, resolveMouseAim, type PointerAim } from "./mouse-aim";
import { buildRadarFrame, buildTacticalCues } from "./tactical-radar";
import { teamLabel } from "./team-label";

const NAME_KEY = "energy-brawl.nickname";
const HAPTICS_MODE_KEY = "energy-brawl.haptics-mode";

function normalizeHapticsMode(value: string | null | undefined): HapticsMode {
  return value === "off" || value === "light" || value === "strong" ? value : "standard";
}

function loadHapticsMode(storage: Pick<Storage, "getItem">): HapticsMode {
  try { return normalizeHapticsMode(storage.getItem(HAPTICS_MODE_KEY)); } catch { return "standard"; }
}

function saveHapticsMode(storage: Pick<Storage, "setItem">, mode: HapticsMode): void {
  try { storage.setItem(HAPTICS_MODE_KEY, mode); } catch { /* Storage may be unavailable. */ }
}

export class MobileApp {
  private readonly network = new GameNetworkClient(true);
  private readonly moveStick: VirtualStick;
  private readonly aimStick: VirtualStick;
  private readonly exclusiveSkillStick: VirtualStick;
  private readonly touchRouter: TouchRouter;
  private readonly viewport: MobileViewport;
  private readonly audio = new CombatAudio(window.localStorage);
  private readonly haptics = new CombatHaptics({
    mode: loadHapticsMode(window.localStorage),
    onFallback: (type) => this.showCombatFallback(type),
  });
  private readonly diagnostics = new ClientDiagnosticsCollector(() => this.network.diagnosticsMatchId);
  private diagnosticsWasConnected = false;
  private diagnosticsHasConnected = false;
  private diagnosticsTickActive = false;
  private renderer: GameRenderer | null = null;
  private rendererMapId: MapId | null = null;
  private selectedCharacterId: CharacterId = CHARACTER_CATALOG[0]!.id;
  private hasSelectedCharacter = false;
  private lastLobbyPreviewCharacterId: CharacterId | null = null;
  private inputSequence = 0;
  private skillActionSequence = 0;
  private exclusiveSkillActionSequence = 0;
  private readonly exclusiveSkillIndicator = new SkillIndicatorController();
  private controlSettings: ControlSettings = loadControlSettings(window.localStorage);
  private readonly pressedKeys = new Set<string>();
  private mouseAim: PointerAim = { x: 0, y: 0, magnitude: 0 };
  private mouseFiring = false;
  private exclusiveKeyboardPreview = false;
  private keyCaptureAction: ControlAction | null = null;
  private layoutEditing = false;
  private layoutDrag: { pointerId: number; control: MovableTouchControl } | null = null;
  private exclusivePreviewPointerId: number | null = null;
  private exclusivePreviewActive = false;
  private lastSkillType: SkillType | null | undefined = undefined;
  private lastInputSentAt = 0;
  private acceptingInput = false;
  private toastTimer = 0;
  private lastRoomUiRevision = "";
  private lastLeaderboardRevision = "";
  private lastKillFeedRevision = "";
  private lastResultsRevision = "";
  private lastCapturePointRevision = "";

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = mobileTemplate();
    const arena = this.find("#arena-screen");
    this.moveStick = new VirtualStick(arena, this.find("#move-stick"), 64, false);
    this.aimStick = new VirtualStick(arena, this.find("#aim-stick"), 64, false);
    this.exclusiveSkillStick = new VirtualStick(arena, this.find("#exclusive-skill-stick"), 72, false);
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
    this.bindKeyboardControls();
    this.applyTouchControlLayout();
    this.network.subscribe(() => {
      this.syncDiagnosticsConnection();
      this.render();
    });
    window.setInterval(() => void this.flushDiagnostics(), 1_000);
    document.addEventListener("visibilitychange", this.handleVisibilityChange, { passive: true });
    window.addEventListener("pagehide", this.handlePageHide, { passive: true });
    requestAnimationFrame(this.inputLoop);
  }

  private syncDiagnosticsConnection(): void {
    const connected = this.network.connected;
    if (connected && !this.diagnosticsWasConnected) {
      if (this.diagnosticsHasConnected) this.diagnostics.recordReconnect();
      this.diagnosticsHasConnected = true;
    }
    this.diagnosticsWasConnected = connected;
    this.diagnostics.setConnected(connected);
    if (!connected) return;
    const profile = collectDeviceProfile(
      navigator as unknown as DeviceProfileNavigator,
      window.screen,
      window.devicePixelRatio || 1,
    );
    this.diagnostics.setNetwork(profile.network);
    this.network.sendDiagnosticsProfile(profile);
  }

  private async flushDiagnostics(): Promise<void> {
    if (this.diagnosticsTickActive) return;
    this.diagnosticsTickActive = true;
    try {
      this.diagnostics.setRtt(await this.network.measureDiagnosticsRtt());
      const sample = this.diagnostics.flush(Date.now());
      if (sample) this.network.sendDiagnosticsSample(sample);
    } finally {
      this.diagnosticsTickActive = false;
    }
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
      const characterId = (target.dataset.characterId as CharacterId | undefined) ?? CHARACTER_CATALOG[0]!.id;
      const ownSeat = this.network.room?.players.find((player) => player.id === this.network.playerId);
      if (!ownSeat) {
        this.selectedCharacterId = characterId;
        this.hasSelectedCharacter = true;
        this.renderColors();
        return;
      }
      void this.network.changeCharacter(characterId).then((result) => {
        if (result.ok) this.hasSelectedCharacter = true;
        if (!result.ok) this.showToast(result.error ?? "无法更换角色");
      });
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
    const exclusiveButton = this.find<HTMLButtonElement>("#exclusive-skill-button");
    exclusiveButton.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        this.cancelExclusiveSkillPreview(-1);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (this.layoutEditing) {
        this.beginLayoutDrag("exclusive", event);
        return;
      }
      if (exclusiveButton.setPointerCapture) exclusiveButton.setPointerCapture(event.pointerId);
      this.exclusiveSkillStick.begin(event.pointerId, event.clientX, event.clientY);
      this.beginExclusiveSkillPreview(event.pointerId);
    });
    exclusiveButton.addEventListener("pointermove", (event) => {
      if (this.layoutDrag?.pointerId === event.pointerId) {
        this.updateLayoutDrag(event);
        return;
      }
      if (this.exclusivePreviewPointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      this.exclusiveSkillStick.move(event.pointerId, event.clientX, event.clientY);
      this.updateExclusiveSkillPreview();
    });
    exclusiveButton.addEventListener("pointerup", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.layoutDrag?.pointerId === event.pointerId) {
        this.endLayoutDrag(event.pointerId);
        return;
      }
      this.releaseExclusiveSkillPreview(event.pointerId);
    });
    exclusiveButton.addEventListener("pointercancel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.layoutDrag?.pointerId === event.pointerId) {
        this.endLayoutDrag(event.pointerId);
        return;
      }
      this.cancelExclusiveSkillPreview(event.pointerId);
    });
    exclusiveButton.addEventListener("lostpointercapture", (event) => {
      const pointerId = (event as PointerEvent).pointerId;
      if (this.exclusivePreviewPointerId === pointerId) this.cancelExclusiveSkillPreview(pointerId);
    });
    const skillButton = this.find<HTMLButtonElement>("#skill-button");
    skillButton.addEventListener("pointerdown", (event) => {
      if (!this.layoutEditing) return;
      event.preventDefault();
      event.stopPropagation();
      this.beginLayoutDrag("skill", event);
    });
    skillButton.addEventListener("pointermove", (event) => {
      if (this.layoutDrag?.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      this.updateLayoutDrag(event);
    });
    for (const type of ["pointerup", "pointercancel"] as const) {
      skillButton.addEventListener(type, (event) => {
        if (this.layoutDrag?.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        this.endLayoutDrag(event.pointerId);
      });
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-controls-open]")) {
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", () => this.openControlSettings());
    }
    this.find("#layout-editor").addEventListener("pointerdown", (event) => event.stopPropagation());
    this.find<HTMLButtonElement>("#controls-close").addEventListener("click", () => this.closeControlSettings());
    this.find<HTMLButtonElement>("#controls-reset-keys").addEventListener("click", () => {
      this.controlSettings = { ...this.controlSettings, keys: { ...DEFAULT_CONTROL_SETTINGS.keys } };
      this.persistControlSettings();
      this.renderControlSettings();
    });
    this.find<HTMLButtonElement>("#controls-edit-layout").addEventListener("click", () => {
      const phase = this.network.room?.phase;
      if (phase !== "playing" && phase !== "overtime" && phase !== "finished") {
        this.showToast("进入对局后可拖动调整触控键位");
        return;
      }
      this.closeControlSettings();
      this.setLayoutEditing(true);
    });
    this.find<HTMLButtonElement>("#layout-save").addEventListener("click", () => this.setLayoutEditing(false));
    this.find<HTMLButtonElement>("#layout-reset").addEventListener("click", () => {
      this.controlSettings = { ...this.controlSettings, touch: { ...DEFAULT_CONTROL_SETTINGS.touch } };
      this.persistControlSettings();
      this.applyTouchControlLayout();
    });
    this.find<HTMLInputElement>("#touch-scale").addEventListener("input", (event) => {
      const scale = Number((event.target as HTMLInputElement).value);
      this.controlSettings = normalizeControlSettings({ ...this.controlSettings, touch: { ...this.controlSettings.touch, scale } });
      this.persistControlSettings();
      this.applyTouchControlLayout();
      this.find("#touch-scale-value").textContent = `${Math.round(this.controlSettings.touch.scale * 100)}%`;
    });
    this.find<HTMLSelectElement>("#haptics-mode").addEventListener("change", (event) => {
      const mode = normalizeHapticsMode((event.target as HTMLSelectElement).value);
      this.haptics.setMode(mode);
      saveHapticsMode(window.localStorage, mode);
    });
    this.find("#key-binding-list").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-bind-action]");
      if (!button) return;
      this.keyCaptureAction = button.dataset.bindAction as ControlAction;
      this.renderControlSettings();
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-fullscreen]")) {
      button.addEventListener("click", async () => {
        const entered = await this.viewport.requestFullscreen();
        if (!entered) this.showToast("当前浏览器将使用沉浸式横屏布局");
      });
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-sound-toggle]")) {
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", async () => {
        await this.audio.unlock();
        this.audio.toggleMuted();
        this.syncSoundButtons();
      });
    }
    // iOS Safari can suspend AudioContext again after backgrounding or an interruption;
    // retry unlock on every gesture so the next touch restores combat audio.
    this.root.addEventListener("pointerdown", () => { void this.audio.unlock(); });
    this.syncSoundButtons();
  }

  private bindKeyboardControls(): void {
    window.addEventListener("keydown", (event) => {
      if (this.keyCaptureAction) {
        event.preventDefault();
        if (event.code === "Escape") {
          this.keyCaptureAction = null;
          this.renderControlSettings();
          return;
        }
        const action = this.keyCaptureAction;
        const keys = { ...this.controlSettings.keys };
        const previousCode = keys[action];
        const conflict = CONTROL_ACTIONS.find((candidate) => candidate !== action && keys[candidate] === event.code);
        keys[action] = event.code;
        if (conflict) keys[conflict] = previousCode;
        this.controlSettings = normalizeControlSettings({ ...this.controlSettings, keys });
        this.keyCaptureAction = null;
        this.persistControlSettings();
        this.renderControlSettings();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      const boundCodes = new Set(Object.values(this.controlSettings.keys));
      if (!boundCodes.has(event.code)) return;
      event.preventDefault();
      this.pressedKeys.add(event.code);
      if (!event.repeat && event.code === this.controlSettings.keys.skill) this.useSkill();
      if (!event.repeat && event.code === this.controlSettings.keys.exclusiveSkill) this.beginExclusiveSkillFromKeyboard();
    });
    window.addEventListener("keyup", (event) => {
      this.pressedKeys.delete(event.code);
      if (event.code === this.controlSettings.keys.exclusiveSkill) this.releaseExclusiveSkillPreview(-1);
    });
    window.addEventListener("blur", () => {
      this.pressedKeys.clear();
      this.cancelExclusiveSkillPreview(-1);
    });
  }

  private openControlSettings(): void {
    this.resetControls();
    this.pressedKeys.clear();
    this.keyCaptureAction = null;
    this.renderControlSettings();
    const dialog = this.find<HTMLDialogElement>("#controls-dialog");
    if (!dialog.open) dialog.showModal();
  }

  private closeControlSettings(): void {
    this.keyCaptureAction = null;
    const dialog = this.find<HTMLDialogElement>("#controls-dialog");
    if (dialog.open) dialog.close();
  }

  private renderControlSettings(): void {
    this.find("#key-binding-list").innerHTML = CONTROL_ACTIONS.map((action) => `
      <div class="key-binding-row">
        <span>${CONTROL_ACTION_LABELS[action]}</span>
        <button type="button" data-bind-action="${action}" class="key-capture${this.keyCaptureAction === action ? " is-capturing" : ""}">
          ${this.keyCaptureAction === action ? "请按新按键…" : formatKeyCode(this.controlSettings.keys[action])}
        </button>
      </div>`).join("");
    const scale = this.find<HTMLInputElement>("#touch-scale");
    scale.value = String(this.controlSettings.touch.scale);
    this.find("#touch-scale-value").textContent = `${Math.round(this.controlSettings.touch.scale * 100)}%`;
    this.find("#desktop-exclusive-key").textContent = formatKeyCode(this.controlSettings.keys.exclusiveSkill);
    this.find("#desktop-skill-key").textContent = formatKeyCode(this.controlSettings.keys.skill);
    this.find<HTMLSelectElement>("#haptics-mode").value = this.haptics.currentMode;
    const editLayout = this.find<HTMLButtonElement>("#controls-edit-layout");
    const phase = this.network.room?.phase;
    const canEditLayout = phase === "playing" || phase === "overtime" || phase === "finished";
    editLayout.disabled = !canEditLayout;
    editLayout.textContent = canEditLayout ? "进入布局编辑" : "进入对局后可编辑布局";
  }

  private persistControlSettings(): void {
    saveControlSettings(window.localStorage, this.controlSettings);
  }

  private applyTouchControlLayout(): void {
    for (const control of ["skill", "exclusive"] as const) {
      const button = this.find<HTMLElement>(control === "skill" ? "#skill-button" : "#exclusive-skill-button");
      const style = touchControlStyle(this.controlSettings.touch, control);
      button.style.left = style.left;
      button.style.top = style.top;
      button.style.right = "auto";
      button.style.bottom = "auto";
      button.style.transform = style.transform;
    }
  }

  private setLayoutEditing(active: boolean): void {
    this.layoutEditing = active;
    this.layoutDrag = null;
    this.find("#arena-screen").classList.toggle("is-layout-editing", active);
    this.find("#layout-editor").classList.toggle("is-hidden", !active);
    this.find("#exclusive-skill-button").classList.remove("is-aiming");
    this.exclusiveSkillStick.reset();
    this.cancelExclusiveSkillPreview(-1);
    this.resetControls();
    if (!active) {
      this.persistControlSettings();
      this.showToast("触控键位已保存");
    }
  }

  private beginLayoutDrag(control: MovableTouchControl, event: PointerEvent): void {
    this.layoutDrag = { pointerId: event.pointerId, control };
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    target.classList.add("is-dragging");
    this.updateLayoutDrag(event);
  }

  private updateLayoutDrag(event: PointerEvent): void {
    if (!this.layoutDrag || this.layoutDrag.pointerId !== event.pointerId) return;
    const arena = this.find("#arena-screen");
    const bounds = arena.getBoundingClientRect();
    const touch = moveTouchControl(this.controlSettings.touch, this.layoutDrag.control, event.clientX, event.clientY, bounds);
    this.controlSettings = { ...this.controlSettings, touch };
    this.applyTouchControlLayout();
  }

  private endLayoutDrag(pointerId: number): void {
    if (!this.layoutDrag || this.layoutDrag.pointerId !== pointerId) return;
    const control = this.layoutDrag.control;
    this.find(control === "skill" ? "#skill-button" : "#exclusive-skill-button").classList.remove("is-dragging");
    this.layoutDrag = null;
    this.persistControlSettings();
  }

  private beginExclusiveSkillFromKeyboard(): void {
    this.exclusiveKeyboardPreview = this.beginExclusiveSkillPreview(-1);
  }

  private bindArenaGestures(): void {
    const arena = this.find("#arena-screen");
    arena.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") {
        if (event.button === 2) {
          event.preventDefault();
          this.cancelExclusiveSkillPreview(-1);
          return;
        }
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button,dialog,input,select,textarea")) return;
        this.mouseAim = this.resolvePointerAim(event.clientX, event.clientY, arena);
        this.mouseFiring = true;
        event.preventDefault();
        return;
      }
      const target = event.target as HTMLElement;
      const role = this.touchRouter.pointerDown(event, Boolean(target.closest?.("[data-skill-button]")));
      if (role && arena.setPointerCapture) arena.setPointerCapture(event.pointerId);
    });
    arena.addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse") {
        this.mouseAim = this.resolvePointerAim(event.clientX, event.clientY, arena);
        return;
      }
      this.touchRouter.pointerMove(event);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        if (event.button === 0) this.mouseFiring = false;
        return;
      }
      this.touchRouter.pointerUp(event.pointerId);
      if (arena.hasPointerCapture?.(event.pointerId)) arena.releasePointerCapture(event.pointerId);
    };
    arena.addEventListener("pointerup", release);
    arena.addEventListener("pointercancel", release);
    arena.addEventListener("lostpointercapture", (event) => this.touchRouter.pointerUp(event.pointerId));
    arena.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") this.mouseFiring = false;
    });
    arena.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (this.exclusivePreviewActive) this.cancelExclusiveSkillPreview(-1);
    });
    window.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse" && event.button === 0) this.mouseFiring = false;
    });
    window.addEventListener("contextmenu", (event) => {
      if (!this.exclusivePreviewActive) return;
      event.preventDefault();
      this.cancelExclusiveSkillPreview(-1);
    });
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
    const nextRoomUiRevision = roomUiRevision(this.network.room);
    if (nextRoomUiRevision !== this.lastRoomUiRevision) {
      this.lastRoomUiRevision = nextRoomUiRevision;
      this.renderColors();
      this.renderRoster();
    }

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
      this.ensureRenderer(this.network.game.mapId ?? "reactor-core");
      this.renderer?.setLocalPlayerId(this.network.playerId);
      this.renderer?.setSnapshot(this.network.game);
      this.renderHud(this.network.game);
      this.renderTacticalHud(this.network.game);
      this.renderResults(this.network.game);
    } else {
      this.haptics.stop();
      if (this.layoutEditing) this.setLayoutEditing(false);
      this.find("#results-overlay").classList.add("is-hidden");
      this.skillActionSequence = 0;
      this.exclusiveSkillActionSequence = 0;
      this.lastSkillType = undefined;
      if (this.renderer) {
        this.renderer.destroy();
        this.renderer = null;
        this.rendererMapId = null;
      }
      this.lastLeaderboardRevision = "";
      this.lastKillFeedRevision = "";
      this.lastResultsRevision = "";
      this.lastCapturePointRevision = "";
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
      const unavailable = isCharacterSelectionDisabled(character.unavailable, ownSeat, character.id);
      return `<button class="color-swatch character-card${character.selected ? " is-selected" : ""}" type="button" data-character-id="${character.id}" style="--swatch:${character.color}" aria-label="选择${character.name}" aria-pressed="${character.selected}" ${unavailable ? "disabled" : ""}>
        <span class="character-portrait"><img src="${CHARACTER_SELECTION_ASSETS[character.id]}" data-character-fallback="${CHARACTER_ASSETS[character.id].fallback}" alt="${character.name}正面立绘" /></span>
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
    const exclusiveSkill = getExclusiveSkill(selected.id);
    this.find("#character-detail").innerHTML = `<div class="character-detail-heading"><div><strong>${selected.name}</strong><span>${selected.role}</span></div><p><b>${selected.passiveName}</b> · ${selected.passiveDescription}</p><p><b>${exclusiveSkill.name}</b> · ${exclusiveSkill.description}（冷却 ${exclusiveSkill.cooldownMs / 1_000} 秒）</p></div>
      <div class="character-traits"><span class="trait-good">优势 ${selected.advantage}</span><span class="trait-cost">代价 ${selected.tradeoff}</span></div>
      <div class="character-stats" aria-label="${selected.name}精确数值"><span>生命 <b>${selected.maxHealth}</b></span><span>伤害 <b>${selected.damage}</b></span><span>移速 <b>${selected.moveSpeed}</b></span><span>射速 <b>${selected.fireCooldownMs}ms</b></span><span>弹速 <b>${selected.projectileSpeed}</b></span></div>`;
    this.renderLobbyCharacterPreview(selected);
  }

  private renderLobbyCharacterPreview(character: (typeof CHARACTER_CATALOG)[number]): void {
    const preview = this.find("#lobby-character-preview");
    const intro = this.find("#lobby-screen .lobby-intro");
    const introCopy = this.find("#lobby-intro-copy");
    if (!this.hasSelectedCharacter) {
      intro.classList.remove("has-character", "is-transitioning");
      preview.innerHTML = "";
      preview.setAttribute("aria-hidden", "true");
      this.lastLobbyPreviewCharacterId = null;
      return;
    }
    if (this.lastLobbyPreviewCharacterId === character.id) return;
    this.lastLobbyPreviewCharacterId = character.id;
    const motion = getCharacterPreviewMotion(character.id);
    for (const className of CHARACTER_PREVIEW_CLASSES) {
      preview.classList.remove(className);
      intro.classList.remove(className);
    }
    preview.classList.add(motion.cssClass);
    intro.classList.add(motion.cssClass);
    for (const element of [preview, intro]) {
      element.style.setProperty("--preview-color", motion.primaryColor);
      element.style.setProperty("--preview-accent", motion.accentColor);
      element.style.setProperty("--preview-duration", `${motion.durationMs}ms`);
    }
    preview.innerHTML = `<div class="preview-energy-field"></div><div class="preview-impact"></div><img src="${CHARACTER_SELECTION_ASSETS[character.id]}" data-character-fallback="${CHARACTER_ASSETS[character.id].fallback}" alt="${character.name}正面像素立绘" /><div class="preview-character-title"><strong>${character.name}</strong><span>${character.role}</span></div>`;
    const image = preview.querySelector<HTMLImageElement>("[data-character-fallback]");
    image?.addEventListener("error", () => {
      const fallback = image.dataset.characterFallback;
      if (fallback && image.src !== new URL(fallback, window.location.href).href) image.src = fallback;
      else image.hidden = true;
    }, { once: true });
    preview.setAttribute("aria-hidden", "false");
    intro.classList.remove("has-character", "is-transitioning");
    introCopy.classList.remove("is-fading-out");
    void intro.offsetWidth;
    intro.classList.add("has-character", "is-transitioning");
    introCopy.classList.add("is-fading-out");
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
              <span class="roster-status"><b>${teamLabel(player.teamId)}</b>${player.isBot ? "AI" : player.ready ? "已准备" : player.connected ? "未准备" : "离线"}</span>
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
    const ownTeamScore = own?.teamId ? snapshot.teamScores?.find((team) => team.teamId === own.teamId) : undefined;
    const ownCaptureScore = own?.teamId ? snapshot.captureScores?.find((team) => team.teamId === own.teamId) : undefined;
    this.find("#own-score").textContent = `${ownTeamScore?.score ?? own?.score ?? 0}`;
    this.find<HTMLElement>("#health-fill").style.width = `${own ? (own.health / own.maxHealth) * 100 : 0}%`;
    this.find("#health-value").textContent = own?.alive ? `${Math.ceil(own.health)}` : "0";
    this.find("#target-score").textContent = `${ownTeamScore?.targetScore ?? TARGET_SCORE}`;
    this.find("#team-score").textContent = snapshot.matchMode === "solo"
      ? "个人战"
      : `${teamLabel(own?.teamId)} · ${(snapshot.teamScores ?? []).map((team) => {
        const capture = snapshot.captureScores?.find((candidate) => candidate.teamId === team.teamId)?.score ?? 0;
        return `${teamLabel(team.teamId)} ${team.score}/${team.targetScore} · 据点 ${capture.toFixed(0)}`;
      }).join(" · ")}`;
    const capture = snapshot.capturePoint;
    const captureStatus = this.find("#capture-status");
    if (!capture || snapshot.matchMode === "solo") captureStatus.textContent = "";
    else if (capture.state === "contested") captureStatus.textContent = `据点争夺中 · ${capture.progress.toFixed(0)}%`;
    else if (capture.ownerTeamId) captureStatus.textContent = `${capture.ownerTeamId === "red" ? "红队" : capture.ownerTeamId === "blue" ? "蓝队" : "金队"} 占领 · ${capture.progress.toFixed(0)}%`;
    else captureStatus.textContent = "据点待占领";
    const captureRevision = capturePointRevision(snapshot);
    if (captureRevision !== this.lastCapturePointRevision) {
      const previous = this.lastCapturePointRevision;
      this.lastCapturePointRevision = captureRevision;
      if (previous && capture?.state === "contested") {
        this.audio.playObjective("contested");
        this.showToast("据点争夺中");
      } else if (previous && capture?.ownerTeamId && capture.state === "owned") {
        this.audio.playObjective("captured");
        this.showToast(`${capture.ownerTeamId === "red" ? "红队" : capture.ownerTeamId === "blue" ? "蓝队" : "金队"} 已占领据点`);
      }
    }
    const holder = snapshot.holderId ? snapshot.players.find((player) => player.id === snapshot.holderId) : null;
    this.find("#match-clock").textContent = holder && snapshot.holdRemainingMs !== null
      ? `${holder.nickname} ${Math.ceil(snapshot.holdRemainingMs / 1_000)}s`
      : snapshot.phase === "overtime" ? "加时" : formatTime(snapshot.remainingMs);
    const leaderboardRevision = gameLeaderboardRevision(snapshot, this.network.playerId);
    if (leaderboardRevision !== this.lastLeaderboardRevision) {
      this.lastLeaderboardRevision = leaderboardRevision;
      this.find("#leaderboard").innerHTML = leaders
        .slice(0, 4)
        .map(
          (player, index) => `<div class="leader-row${player.id === this.network.playerId ? " is-you" : ""}">
            <span>${index + 1}</span><i style="--player-color:${player.color}"></i><em class="leader-team">${teamLabel(player.teamId)}</em><b>${escapeHtml(player.nickname)}</b><strong>${player.score}</strong>
          </div>`,
        )
        .join("");
    }
    const killFeedback = selectLatestKillFeedback(
      snapshot.killFeed ?? [],
      this.network.playerId,
      this.lastKillFeedRevision,
      snapshot.serverTime,
    );
    const killFeedRevision = killFeedback.event?.id ?? "";
    if (killFeedRevision !== this.lastKillFeedRevision) {
      this.lastKillFeedRevision = killFeedRevision;
      if (killFeedback.streakToPlay !== null) this.audio.playKillStreak(killFeedback.streakToPlay);
      const event = killFeedback.event;
      this.find("#kill-feed").innerHTML = event ? (() => {
        const killer = snapshot.players.find((player) => player.id === event.killerId);
        const victim = snapshot.players.find((player) => player.id === event.victimId);
        if (!killer || !victim) return "";
        const local = killer.id === this.network.playerId || victim.id === this.network.playerId;
        return `<div class="kill-feed-row${local ? " is-local" : ""}"><i style="--killer-color:${killer.color}"></i><b>${escapeHtml(killer.nickname)}</b><span>击败</span><b>${escapeHtml(victim.nickname)}</b><i style="--killer-color:${victim.color}"></i></div>`;
      })() : "";
    }
    const respawn = this.find("#respawn-state");
    const remaining = own?.respawnAt ? Math.max(0, own.respawnAt - snapshot.serverTime) : 0;
    respawn.textContent = own && !own.alive ? `${Math.ceil(remaining / 1_000)} 秒后重返战场` : "";
    respawn.classList.toggle("is-hidden", own?.alive !== false);
    this.renderSkillButton(own);
    this.renderExclusiveSkillButton(own, snapshot.serverTime);
  }

  private renderExclusiveSkillButton(player: PlayerSnapshot | undefined, serverTime: number): void {
    const button = this.find<HTMLButtonElement>("#exclusive-skill-button");
    if (!player) { button.disabled = true; return; }
    const skill = getExclusiveSkill(player.characterId);
    const remaining = Math.max(0, (player.exclusiveSkillReadyAt ?? 0) - serverTime);
    const mode = exclusiveSkillButtonMode(player, serverTime);
    button.disabled = !canPressExclusiveSkill(player, serverTime);
    button.classList.toggle("is-ready", mode === "ready" || mode === "anchor-return");
    button.classList.toggle("is-anchor-return", mode === "anchor-return");
    const status = mode === "anchor-return" ? "返回锚点" : mode === "cooldown" ? `${(remaining / 1_000).toFixed(1)}s` : mode === "ready" ? "就绪" : "等待复活";
    button.innerHTML = `<img class="exclusive-skill-icon" src="${EXCLUSIVE_SKILL_ICON_ASSETS[player.characterId]}" alt="" /><span><b>${skill.name}</b><small>${status}</small></span><kbd>${formatKeyCode(this.controlSettings.keys.exclusiveSkill)}</kbd>`;
    button.setAttribute("aria-label", `${skill.name} · ${skill.description}`);
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
      ? `<img src="${SKILL_ICON_ASSETS[type]}" alt="" /><span><b>${SKILL_CATALOG[type].name}</b><small>一次</small></span><kbd>${formatKeyCode(this.controlSettings.keys.skill)}</kbd>`
      : `<span class="skill-empty-mark">◇</span><span><b>技能槽</b><small>等待拾取</small></span><kbd>${formatKeyCode(this.controlSettings.keys.skill)}</kbd>`;
    button.setAttribute("aria-label", type ? `使用${SKILL_CATALOG[type].name}` : "技能槽为空");
    if (didPickUpLocalSkill(previous, type)) this.audio.playPickup();
    if (type && previous !== type) this.showToast(`获得技能：${SKILL_CATALOG[type].name}`);
  }

  private syncSoundButtons(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-sound-toggle]")) {
      const muted = this.audio.isMuted;
      button.classList.toggle("is-muted", muted);
      button.textContent = muted ? "声音静音" : "声音开";
      button.setAttribute("aria-label", muted ? "打开声音" : "关闭声音");
    }
  }

  private renderResults(snapshot: GameSnapshot): void {
    const overlay = this.find("#results-overlay");
    const finished = snapshot.phase === "finished";
    overlay.classList.toggle("is-hidden", !finished);
    if (!finished) return;
    const ranking = [...snapshot.players].sort((a, b) => b.score - a.score || b.kills - a.kills);
    const winner = ranking[0];
    const resultsRevision = `${gameLeaderboardRevision(snapshot, this.network.playerId)}|${snapshot.finishedAt ?? snapshot.serverTime}|${snapshot.winnerIds.join(",")}`;
    if (resultsRevision !== this.lastResultsRevision) {
      this.lastResultsRevision = resultsRevision;
      const ownWon = snapshot.winnerIds.includes(this.network.playerId ?? "");
      const winningTeam = snapshot.matchMode !== "solo" ? winner?.teamId : null;
      this.find("#result-title").textContent = ownWon ? "你赢了" : winningTeam ? `${winningTeam === "red" ? "红队" : winningTeam === "blue" ? "蓝队" : "金队"}获胜` : `${winner?.nickname ?? "本局"} 获胜`;
      const mvp = snapshot.players.find((player) => player.id === snapshot.matchMvpId);
      this.find("#result-mvp").innerHTML = mvp
        ? `<span>MVP</span><i style="--player-color:${mvp.color}"></i><b>${escapeHtml(mvp.nickname)}</b><strong>${snapshot.matchMvpScore ?? 0}</strong><small>综合贡献</small>`
        : `<span>MVP</span><b>无</b>`;
      this.find("#result-list").innerHTML = `<div class="result-table-head"><span>#</span><span>玩家</span><span>K/D/A</span><span>伤害</span><span>治疗</span><span>承伤</span><span>技能</span><span>积分</span></div>` + ranking
        .map(
          (player, index) => `<div class="result-row${player.id === this.network.playerId ? " is-you" : ""}${player.id === snapshot.matchMvpId ? " is-mvp" : ""}">
            <span class="result-rank">${index + 1}</span><span class="result-player"><i style="--player-color:${player.color}"></i><em class="result-team">${teamLabel(player.teamId)}</em><b>${escapeHtml(player.nickname)}</b></span>
            <span>${player.kills}/${player.deaths ?? 0}/${player.assists ?? 0}</span><span>${Math.round(player.damageDealt ?? 0)}</span><span>${Math.round(player.healingDone ?? 0)}</span><span>${Math.round(player.damageTaken ?? 0)}</span><span>${player.skillContribution ?? 0}</span><strong>${player.score}</strong>
          </div>`,
        )
        .join("");
    }
    const countdown = Math.max(0, (snapshot.finishedAt ?? snapshot.serverTime) + LOBBY_RETURN_DELAY_MS - snapshot.serverTime);
    this.find("#return-countdown").textContent = `${Math.ceil(countdown / 1_000)}s 后自动回大厅`;
  }

  private renderTacticalHud(snapshot: GameSnapshot): void {
    const canvas = this.find<HTMLCanvasElement>("#tactical-radar");
    const size = Math.max(1, Math.round(canvas.clientWidth || 148));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const physicalSize = Math.round(size * dpr);
    if (canvas.width !== physicalSize || canvas.height !== physicalSize) {
      canvas.width = physicalSize;
      canvas.height = physicalSize;
    }
    const context = canvas.getContext("2d");
    if (context) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, size, size);
      drawRadar(context, buildRadarFrame(snapshot, this.network.playerId, size));
    }
    const viewport = this.renderer?.getCameraWorldView();
    const arena = this.find<HTMLElement>("#arena-screen");
    const own = snapshot.players.find((player) => player.id === this.network.playerId);
    const cues = viewport ? buildTacticalCues(snapshot, this.network.playerId, viewport, {
      width: arena.clientWidth || window.innerWidth,
      height: arena.clientHeight || window.innerHeight,
    }, { attackerId: own?.lastDamageSourceId ?? null, damagedAt: own?.lastDamagedAt ?? null }) : [];
    this.find("#tactical-cues").innerHTML = cues.map((cue) => `<div class="tactical-cue is-${cue.kind}" style="--cue-x:${cue.x}px;--cue-y:${cue.y}px;--cue-angle:${cue.angle}rad;--cue-color:${cue.color}"><i>➤</i><span>${cue.kind === "danger" ? "受击" : cue.kind === "objective" ? "据点" : "队友"} ${cue.distance}</span></div>`).join("");
  }

  private ensureRenderer(mapId: MapId): void {
    if (this.renderer && this.rendererMapId !== mapId) {
      this.renderer.destroy();
      this.renderer = null;
    }
    if (!this.renderer) {
      this.renderer = new GameRenderer(this.find("#game-root"), this.network.playerId, this.audio, mapId, {
        onFrame: (deltaMs) => this.diagnostics.recordFrame(deltaMs),
        onCorrection: (distancePx, hard) => this.diagnostics.recordCorrection(distancePx, hard),
        onAuthoritativeInput: (lastProcessedInput) => this.diagnostics.acknowledgeInputs(lastProcessedInput, performance.now()),
      }, (events) => this.handleCombatFeedback(events));
      this.rendererMapId = mapId;
    }
  }

  private handleCombatFeedback(events: readonly CombatFeedbackEvent[]): void {
    this.haptics.handleEvents(events);
  }

  private showCombatFallback(type: CombatFeedbackEvent["type"]): void {
    const arena = this.find("#arena-screen");
    arena.dataset.combatFeedback = type;
    window.setTimeout(() => {
      if (arena.dataset.combatFeedback === type) delete arena.dataset.combatFeedback;
    }, type === "kill" ? 420 : 220);
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) this.haptics.stop();
  };

  private readonly handlePageHide = (): void => {
    this.haptics.stop();
  };

  private resolvePointerAim(clientX: number, clientY: number, arena: HTMLElement): PointerAim {
    const rendererAim = this.renderer?.resolvePointerAim(clientX, clientY, arena.getBoundingClientRect());
    if (rendererAim && (rendererAim.x !== 0 || rendererAim.y !== 0)) return { ...rendererAim, magnitude: 1 };
    return resolveMouseAim(clientX, clientY, arena.getBoundingClientRect());
  }

  private readonly inputLoop = (time: number): void => {
    const ownSeat = this.network.room?.players.find((player) => player.id === this.network.playerId);
    const ownPlayer = this.network.game?.players.find((player) => player.id === this.network.playerId);
    const activePhase = this.network.game?.phase === "playing" || this.network.game?.phase === "overtime";
    const controlsOpen = this.find<HTMLDialogElement>("#controls-dialog").open;
    const acceptingInput = this.network.connected && this.network.playerSessionReady && ownSeat?.connected === true && ownSeat.isBot === false && activePhase && !controlsOpen && !this.layoutEditing;
    if (acceptingInput) {
      const touchMove = this.moveStick.getValue();
      const touchAim = this.aimStick.getValue();
      const keyboard = resolveKeyboardControl(this.pressedKeys, this.controlSettings.keys);
      const keyboardMoveMagnitude = Math.hypot(keyboard.move.x, keyboard.move.y);
      const move = touchMove.magnitude > 0.08
        ? touchMove
        : { ...keyboard.move, magnitude: keyboardMoveMagnitude };
      const keyboardAim = keyboard.firing && ownPlayer
        ? { x: Math.cos(ownPlayer.angle), y: Math.sin(ownPlayer.angle), magnitude: 1 }
        : { x: 0, y: 0, magnitude: 0 };
      const aim = touchAim.magnitude > 0.08
        ? touchAim
        : this.mouseAim.magnitude > 0.08
          ? this.mouseAim
          : keyboardAim;
      this.renderer?.setLocalInput(move);
      this.renderer?.setLocalAim(aim);
      this.updateExclusiveSkillPreview();
      if (time - this.lastInputSentAt >= 33) {
        const input = {
          seq: ++this.inputSequence,
          moveX: move.x,
          moveY: move.y,
          aimX: aim.x,
          aimY: aim.y,
          firing: (this.mouseFiring || keyboard.firing || touchAim.magnitude > 0.15) && aim.magnitude > 0.15,
        };
        const deltaMs = this.lastInputSentAt > 0 ? Math.min(100, time - this.lastInputSentAt) : 33;
        this.renderer?.addLocalInput(input, deltaMs);
        this.diagnostics.recordInputSent(input.seq, time);
        this.network.sendInput(input);
        this.lastInputSentAt = time;
      }
    } else {
      if (this.exclusivePreviewActive) this.cancelExclusiveSkillPreview(this.exclusivePreviewPointerId ?? -1);
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
    this.exclusiveSkillStick.reset();
    this.pressedKeys.clear();
    this.mouseFiring = false;
    this.exclusiveKeyboardPreview = false;
    this.cancelExclusiveSkillPreview(-1);
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

  private beginExclusiveSkillPreview(pointerId: number): boolean {
    const own = this.network.game?.players.find((player) => player.id === this.network.playerId);
    const serverTime = this.network.game?.serverTime ?? 0;
    if (!this.acceptingInput || !own) { this.exclusiveSkillStick.reset(); this.showToast("暂时无法使用专属技能"); return false; }
    if (!canPressExclusiveSkill(own, serverTime)) {
      this.exclusiveSkillStick.reset();
      const remaining = Math.max(0, (own.exclusiveSkillReadyAt ?? 0) - serverTime);
      this.showToast(own.alive ? `专属技能冷却 ${Math.ceil(remaining / 1_000)} 秒` : "等待复活");
      return false;
    }
    const skillId = own.characterId as SkillIndicatorSkill;
    const profile = getSkillIndicatorProfile(skillId);
    const fallbackDirection = { x: Math.cos(own.angle), y: Math.sin(own.angle) };
    const direction = pointerId === -1
      ? resolveHeldSkillAim(this.mouseAim, fallbackDirection)
      : resolveSkillStickDirection(this.exclusiveSkillStick.getValue(), fallbackDirection);
    this.exclusiveSkillIndicator.begin(skillId, { x: own.x, y: own.y }, profile.range);
    this.exclusiveSkillIndicator.update(direction);
    this.exclusivePreviewPointerId = pointerId;
    this.exclusivePreviewActive = true;
    this.find("#exclusive-skill-button").classList.add("is-aiming");
    const hint = this.find("#skill-aim-hint");
    hint.textContent = pointerId === -1
      ? "按住专属技能键，移动鼠标瞄准，松开释放"
      : isDisplacementSkill(own.characterId) ? "拖动技能摇杆选择位移方向，松手释放" : "拖动技能摇杆调整技能方向，松手释放";
    hint.classList.remove("is-hidden");
    this.renderer?.setExclusiveSkillPreview(this.exclusiveSkillIndicator.snapshot());
    return true;
  }

  private updateExclusiveSkillPreview(): void {
    if (!this.exclusivePreviewActive) return;
    const own = this.network.game?.players.find((player) => player.id === this.network.playerId);
    if (!own) return;
    const fallbackDirection = { x: Math.cos(own.angle), y: Math.sin(own.angle) };
    const direction = this.exclusiveKeyboardPreview
      ? resolveHeldSkillAim(this.mouseAim, fallbackDirection)
      : resolveSkillStickDirection(this.exclusiveSkillStick.getValue(), fallbackDirection);
    this.exclusiveSkillIndicator.update(direction);
    this.renderer?.setExclusiveSkillPreview(this.exclusiveSkillIndicator.snapshot());
  }

  private releaseExclusiveSkillPreview(pointerId: number): void {
    if (!this.exclusivePreviewActive || this.exclusivePreviewPointerId !== pointerId) return;
    const own = this.network.game?.players.find((player) => player.id === this.network.playerId);
    const fallbackDirection = own ? { x: Math.cos(own.angle), y: Math.sin(own.angle) } : { x: 1, y: 0 };
    const direction = this.exclusiveKeyboardPreview
      ? resolveHeldSkillAim(this.mouseAim, fallbackDirection)
      : resolveSkillStickDirection(this.exclusiveSkillStick.getValue(), fallbackDirection);
    this.exclusiveSkillIndicator.update(direction);
    const preview = this.exclusiveSkillIndicator.release();
    this.exclusivePreviewActive = false;
    this.exclusivePreviewPointerId = null;
    this.exclusiveKeyboardPreview = false;
    this.exclusiveSkillStick.end(pointerId);
    this.find("#exclusive-skill-button").classList.remove("is-aiming");
    this.find("#skill-aim-hint").classList.add("is-hidden");
    this.renderer?.setExclusiveSkillPreview(null);
    this.sendExclusiveSkill(preview.direction);
  }

  private cancelExclusiveSkillPreview(pointerId: number): void {
    if (!this.exclusivePreviewActive || (pointerId !== -1 && this.exclusivePreviewPointerId !== pointerId)) return;
    this.exclusiveSkillIndicator.cancel();
    this.exclusivePreviewActive = false;
    this.exclusivePreviewPointerId = null;
    this.exclusiveKeyboardPreview = false;
    this.exclusiveSkillStick.reset();
    this.find("#exclusive-skill-button").classList.remove("is-aiming");
    this.find("#skill-aim-hint").classList.add("is-hidden");
    this.renderer?.setExclusiveSkillPreview(null);
  }

  private sendExclusiveSkill(direction: { x: number; y: number }): void {
    const own = this.network.game?.players.find((player) => player.id === this.network.playerId);
    if (!this.acceptingInput || !own) return;
    this.exclusiveSkillActionSequence = Math.max(this.exclusiveSkillActionSequence, own.lastProcessedExclusiveSkillAction ?? 0) + 1;
    this.network.sendExclusiveSkillAction(this.exclusiveSkillActionSequence, direction.x, direction.y);
  }

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
         <div class="header-actions"><button class="control-settings-button" data-controls-open type="button">键位</button><button class="sound-button" data-sound-toggle type="button" aria-label="关闭声音">声音开</button><button class="fullscreen-button" data-fullscreen type="button">全屏</button><span id="connection-state" class="connection-state">正在连接</span></div>
      </header>

      <section id="lobby-screen" class="lobby-screen">
        <div class="lobby-intro">
          <div id="lobby-character-preview" class="lobby-character-preview" aria-hidden="true"></div>
          <div id="lobby-intro-copy" class="lobby-intro-copy"><span class="eyebrow">LAN ARENA · 6 PLAYERS</span>
          <h1>能量乱斗</h1>
          <p id="lobby-status">正在连接房间</p></div>
        </div>
        <div class="lobby-workspace">
          <section class="character-panel">
            <div class="section-heading"><span>选择角色</span><small>准备前可更换 · 每名真人角色唯一 · AI 不锁定</small></div>
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
          <canvas id="tactical-radar" class="tactical-radar" aria-label="战术雷达"></canvas>
          <div id="tactical-cues" class="tactical-cues" aria-hidden="true"></div>
          <div class="self-status">
            <div class="health-line"><span>HP</span><div class="health-track"><i id="health-fill"></i></div><strong id="health-value">100</strong></div>
            <div class="score-line"><span>积分</span><strong id="own-score">0</strong><small>/ <span id="target-score">15</span></small></div>
          </div>
          <div id="match-clock" class="match-clock">5:00</div>
          <div id="team-score" class="team-score">个人战</div>
          <div id="capture-status" class="capture-status" aria-live="polite"></div>
          <div id="kill-feed" class="kill-feed" aria-live="polite"></div>
          <div id="leaderboard" class="leaderboard"></div>
           <button class="control-settings-button arena-controls" data-controls-open type="button">键位</button><button class="sound-button arena-sound" data-sound-toggle type="button" aria-label="关闭声音">声音开</button><button class="fullscreen-button arena-fullscreen" data-fullscreen type="button">全屏</button>
          <div id="respawn-state" class="respawn-state is-hidden"></div>
           <div id="skill-aim-hint" class="skill-aim-hint is-hidden">拖动技能摇杆选择方向，松手释放</div>
           <div class="desktop-control-hint" aria-hidden="true"><span><kbd>WASD</kbd> 移动</span><span><i class="mouse-icon"></i> 移动瞄准 · 左键射击</span><span>长按 <kbd id="desktop-exclusive-key">E</kbd> 瞄准专属技能</span><span><kbd id="desktop-skill-key">Q</kbd> 一次性技能</span></div>
        </div>
        <div class="control-layer">
          <button id="exclusive-skill-button" class="skill-button exclusive-skill-button" data-exclusive-skill-button type="button" aria-label="专属技能"><span class="exclusive-skill-mark">✦</span><span><b>专属技能</b><small>等待状态</small></span><kbd>E</kbd></button>
          <button id="skill-button" class="skill-button" data-skill-button data-skill-type="empty" type="button" aria-label="技能槽为空" aria-disabled="true"><span class="skill-empty-mark">◇</span><span><b>技能槽</b><small>等待拾取</small></span><kbd>Q</kbd></button>
          <div id="exclusive-skill-stick" class="virtual-stick exclusive-skill-stick"><div class="stick-mark">SKILL</div><div class="stick-knob"></div></div>
          <div id="move-stick" class="virtual-stick move-stick"><div class="stick-mark">MOVE</div><div class="stick-knob"></div></div>
          <div id="aim-stick" class="virtual-stick aim-stick"><div class="stick-mark">FIRE</div><div class="stick-knob"></div></div>
          <div id="layout-editor" class="layout-editor is-hidden"><strong>拖动两个技能按钮调整位置</strong><span>移动与攻击摇杆仍可在左右半屏任意位置呼出</span><button id="layout-reset" type="button">恢复默认</button><button id="layout-save" type="button">保存布局</button></div>
        </div>
        <div id="results-overlay" class="results-overlay is-hidden">
          <div class="results-panel"><span class="eyebrow">MATCH COMPLETE</span><h2 id="result-title">本局结束</h2><div id="result-mvp" class="result-mvp"></div><div id="result-list" class="result-list"></div><p id="return-countdown"></p><button id="return-lobby" class="primary-button" type="button">返回大厅</button></div>
        </div>
      </section>
      <dialog id="controls-dialog" class="controls-dialog">
        <div class="controls-dialog-heading"><div><span class="eyebrow">PLAYER CONTROLS</span><h2>自定义键位</h2></div><button id="controls-close" type="button" aria-label="关闭">×</button></div>
        <div class="controls-dialog-grid">
          <section><h3>电脑按键</h3><p>鼠标移动控制瞄准，按住左键持续射击；长按专属技能键并移动鼠标，松键后朝瞄准位置释放。点击按键后按下新键即可重映射，冲突键位会自动交换。</p><div id="key-binding-list" class="key-binding-list"></div><button id="controls-reset-keys" class="secondary-control-button" type="button">恢复默认按键</button></section>
          <section><h3>手机触控布局</h3><p>移动和攻击摇杆保持浮动；两个技能按钮可以自由拖动。</p><label class="touch-scale-label"><span>按钮大小 <b id="touch-scale-value">100%</b></span><input id="touch-scale" type="range" min="0.75" max="1.35" step="0.05" value="1" /></label><label class="touch-scale-label"><span>战斗震动</span><select id="haptics-mode"><option value="standard">标准</option><option value="light">轻微</option><option value="strong">强烈</option><option value="off">关闭</option></select></label><button id="controls-edit-layout" class="primary-button" type="button">进入布局编辑</button></section>
        </div>
      </dialog>
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

function drawRadar(context: CanvasRenderingContext2D, frame: ReturnType<typeof buildRadarFrame>): void {
  const size = frame.size;
  context.fillStyle = "rgba(5, 10, 14, 0.86)";
  context.fillRect(0, 0, size, size);
  context.strokeStyle = "rgba(154, 194, 211, 0.42)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, size - 1, size - 1);
  context.fillStyle = "rgba(102, 130, 143, 0.55)";
  for (const wall of frame.walls) context.fillRect(wall.x, wall.y, wall.width, wall.height);
  context.fillStyle = "#8fe9ff";
  for (const orb of frame.energy) context.fillRect(orb.x - 1.5, orb.y - 1.5, 3, 3);
  context.fillStyle = "#f2c14e";
  for (const orb of frame.skillOrbs) context.fillRect(orb.x - 2, orb.y - 2, 4, 4);
  if (frame.capturePoint) {
    context.strokeStyle = frame.capturePoint.state === "contested" ? "#ff5a5f" : "#ffd166";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(frame.capturePoint.x, frame.capturePoint.y, Math.max(4, frame.capturePoint.radius), 0, Math.PI * 2);
    context.stroke();
  }
  for (const marker of frame.players) {
    context.fillStyle = marker.kind === "local" ? "#ffffff" : marker.color;
    context.beginPath();
    context.arc(marker.x, marker.y, marker.kind === "local" ? 4 : 3, 0, Math.PI * 2);
    context.fill();
  }
}
