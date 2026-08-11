import Phaser from "phaser";

import { CHARACTER_CATALOG } from "../shared/character-catalog";
import { getMapDefinition, type MapId } from "../shared/map-catalog";
import { ARENA_HEIGHT, ARENA_WIDTH, PLAYER_RADIUS, PROJECTILE_MAX_DISTANCE, VIEW_HEIGHT, VIEW_WIDTH } from "../shared/constants";
import { SKILL_TYPES, type SkillType } from "../shared/skill-catalog";
import type { CapturePointSnapshot, GameSnapshot, PlayerInput, PlayerSnapshot, Vec2 } from "../shared/protocol";
import { AIM_GUIDE_LINE_WIDTH, calculateAimGuide } from "./aim-guide";
import {
  ARENA_ASSETS,
  CHARACTER_ASSETS,
  CHARACTER_DIRECTION_ASSETS,
  CHARACTER_DIRECTIONS,
  PROJECTILE_FX_ASSETS,
  PICKUP_ASSETS,
  SKILL_ICON_ASSETS,
  WEAPON_ASSETS,
  type CharacterAssetState,
  type CharacterDirection,
} from "./asset-registry";
import { resolveCameraView, shouldSnapCameraOnRespawn } from "./camera-follow";
import { CombatAudio } from "./combat-audio";
import {
  effectCapacity,
  projectileAngle,
  PROJECTILE_VIEW_CAPACITY,
  shouldEmitProjectileTrail,
  shouldRenderProjectileImageEffect,
  shouldShowProjectileTrace,
  type TrailMemory,
} from "./combat-feedback";
import {
  FixedObjectPool,
  ReusableObjectPool,
  characterDirectionFromAngle,
  characterDirectionTextureKey,
  characterWeaponKind,
  characterTextureKey,
  deriveCharacterVisualState,
  getPlayerChildLayerOrder,
  resolveCharacterDirectionTextureKey,
  resolveCharacterTextureKey,
  resolveWeaponTransform,
  shouldRenderEffect,
  type CombatEffectKind,
  type CharacterVisualState,
} from "./effect-pool";
import { consumePositionCorrection, InputReconciler } from "./input-reconciliation";
import { calculateArenaCameraZoom } from "./mobile-viewport";
import { predictLocalPosition } from "./prediction";
import { shouldAdvanceSnapshotAnchor, SnapshotBuffer } from "./snapshot-buffer";
import type { SkillIndicatorState } from "./skill-indicator";
import { getSkillIndicatorProfile } from "./skill-indicator";
import { getExclusiveEffectProfile } from "./skill-effects";
import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import { resolveRenderMetrics, type RenderMetrics } from "./render-metrics";

interface PlayerView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  weapon: Phaser.GameObjects.Image;
  aim: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  healthFill: Phaser.GameObjects.Rectangle;
  shadow: Phaser.GameObjects.Ellipse;
  ring: Phaser.GameObjects.Arc;
  shield: Phaser.GameObjects.Arc | null;
  lastHealth: number;
  wasAlive: boolean;
  attackUntil: number;
  hitUntil: number;
  lastDashEffectAt: number;
  lastHealEffectAt: number;
  visualState: CharacterVisualState;
  direction: CharacterDirection;
}

interface MovingView {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  coreSprite: Phaser.GameObjects.Image;
  traceSprite: Phaser.GameObjects.Image;
  ownerId: string;
  color: number;
  lastTrail: TrailMemory;
}

interface ExclusiveEffectView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  inner: Phaser.GameObjects.Arc;
  outer: Phaser.GameObjects.Arc;
  orbit: Phaser.GameObjects.Arc;
  graphics: Phaser.GameObjects.Graphics;
  skillId: ExclusiveSkillId;
  startedAt: number;
}

const CHARACTER_RENDER_STATES: readonly CharacterAssetState[] = ["idle", "move", "attack", "hit", "death", "fallback"];
const SKILL_COLORS: Readonly<Record<SkillType, number>> = {
  dash: 0x4da3ff,
  shield: 0x59ece2,
  spread: 0xff6b70,
  heal: 0x56e09a,
};

export class GameRenderer {
  private readonly scene: ArenaScene;
  private readonly game: Phaser.Game;
  private readonly container: HTMLElement;
  private renderMetrics: RenderMetrics;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, localPlayerId: string | null, audio: CombatAudio, mapId: MapId = "reactor-core") {
    this.container = container;
    this.scene = new ArenaScene(localPlayerId, audio, mapId);
    const width = Math.max(1, container.clientWidth || VIEW_WIDTH);
    const height = Math.max(1, container.clientHeight || VIEW_HEIGHT);
    this.renderMetrics = resolveRenderMetrics(width, height, window.devicePixelRatio || 1);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: this.renderMetrics.physicalWidth,
      height: this.renderMetrics.physicalHeight,
      backgroundColor: "#101419",
      scene: this.scene,
      transparent: false,
      antialias: true,
      scale: {
        mode: Phaser.Scale.NONE,
        width: this.renderMetrics.physicalWidth,
        height: this.renderMetrics.physicalHeight,
      },
      render: {
        roundPixels: false,
        antialiasGL: true,
        powerPreference: "high-performance",
      },
    });
    this.resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.resizeForHiDpi());
    this.resizeObserver?.observe(container);
    window.addEventListener("resize", this.resizeForHiDpi, { passive: true });
  }

  setSnapshot(snapshot: GameSnapshot): void {
    this.scene.applySnapshot(snapshot);
  }

  setLocalPlayerId(playerId: string | null): void {
    this.scene.setLocalPlayerId(playerId);
  }

  setLocalInput(input: Vec2): void {
    this.scene.setLocalInput(input);
  }

  setLocalAim(input: Vec2): void {
    this.scene.setLocalAim(input);
  }

  addLocalInput(input: PlayerInput, deltaMs: number): void {
    this.scene.addLocalInput(input, deltaMs);
  }

  resetLocalInputs(): void {
    this.scene.resetLocalInputs();
  }

  setExclusiveSkillPreview(state: SkillIndicatorState | null): void {
    this.scene.setExclusiveSkillPreview(state);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.resizeForHiDpi);
    this.game.destroy(true);
  }

  private readonly resizeForHiDpi = (): void => {
    const width = Math.max(1, this.container.clientWidth || VIEW_WIDTH);
    const height = Math.max(1, this.container.clientHeight || VIEW_HEIGHT);
    this.renderMetrics = resolveRenderMetrics(width, height, window.devicePixelRatio || 1);
    this.game.scale.resize(this.renderMetrics.physicalWidth, this.renderMetrics.physicalHeight);
  };
}

class ArenaScene extends Phaser.Scene {
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly projectileViews = new Map<string, MovingView>();
  private readonly energyViews = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly skillOrbViews = new Map<string, Phaser.GameObjects.Container>();
  private readonly exclusiveEffectRevisions = new Map<string, string>();
  private readonly exclusiveEffectViews = new Map<string, ExclusiveEffectView>();
  private readonly snapshotBuffer = new SnapshotBuffer<GameSnapshot>();
  private readonly inputReconciler = new InputReconciler();
  private snapshot: GameSnapshot | null = null;
  private localInput: Vec2 = { x: 0, y: 0 };
  private localAim: Vec2 = { x: 0, y: 0 };
  private aimCorridor: Phaser.GameObjects.Rectangle | null = null;
  private aimEnd: Phaser.GameObjects.Arc | null = null;
  private exclusiveSkillPreview: SkillIndicatorState | null = null;
  private exclusiveSkillIndicatorGraphics: Phaser.GameObjects.Graphics | null = null;
  private capturePointGraphics: Phaser.GameObjects.Graphics | null = null;
  private capturePointPulse: Phaser.GameObjects.Arc | null = null;
  private latestSnapshotReceivedAt = 0;
  private renderDelayMs = 100;
  private correctionRemaining: Vec2 = { x: 0, y: 0 };
  private readonly failedTextureKeys = new Set<string>();
  private effectPools: Record<CombatEffectKind, FixedObjectPool<Phaser.GameObjects.Arc>> | null = null;
  private projectileImagePools: Record<"muzzle" | "trail" | "impact" | "spark" | "smoke", FixedObjectPool<Phaser.GameObjects.Image>> | null = null;
  private projectilePool: ReusableObjectPool<MovingView> | null = null;
  private ready = false;

  constructor(private localPlayerId: string | null, private readonly audio: CombatAudio, private readonly mapId: MapId) {
    super({ key: "arena" });
  }

  preload(): void {
    this.load.svg("energy-core", PICKUP_ASSETS.energyCore, { width: 96, height: 96 });
    this.load.svg("arena-sigil", ARENA_ASSETS.sigil, { width: 240, height: 240 });
    this.load.image("arena-floor-v3", ARENA_ASSETS.floor);
    this.load.image("arena-wall-v3", ARENA_ASSETS.wall);
    this.load.image("arena-decal-v3", ARENA_ASSETS.decal);
    this.load.image("arena-light-v3", ARENA_ASSETS.light);
    this.load.image("fx-projectile-core", PROJECTILE_FX_ASSETS.core);
    this.load.image("fx-projectile-trace", PROJECTILE_FX_ASSETS.trace);
    this.load.image("fx-muzzle-flare", PROJECTILE_FX_ASSETS.muzzle);
    this.load.image("fx-impact-burst", PROJECTILE_FX_ASSETS.impact);
    this.load.image("fx-impact-spark", PROJECTILE_FX_ASSETS.spark);
    this.load.image("fx-impact-smoke", PROJECTILE_FX_ASSETS.smoke);
    for (const type of SKILL_TYPES) this.load.svg(`skill-${type}`, SKILL_ICON_ASSETS[type], { width: 64, height: 64 });
    for (const character of CHARACTER_CATALOG) this.load.svg(`exclusive-fx:${character.id}`, `/assets/v4/fx/skills/${character.id}.svg`, { width: 256, height: 256 });
    for (const [kind, asset] of Object.entries(WEAPON_ASSETS)) this.load.image(`weapon:${kind}`, asset);
    for (const character of CHARACTER_CATALOG) {
      for (const state of CHARACTER_RENDER_STATES) {
        const key = characterTextureKey(character.id, state);
        const asset = CHARACTER_ASSETS[character.id][state];
        if (asset.endsWith(".svg")) this.load.svg(key, asset, { width: 192, height: 192 });
        else this.load.image(key, asset);
      }
      for (const direction of CHARACTER_DIRECTIONS) {
        this.load.image(
          characterDirectionTextureKey(character.id, direction),
          CHARACTER_DIRECTION_ASSETS[character.id][direction],
        );
      }
    }
    this.load.on("loaderror", (file: Phaser.Loader.File) => this.failedTextureKeys.add(String(file.key)));
  }

  create(): void {
    this.createGeneratedFallbackTextures();
    this.drawArena();
    this.createEffectPools();
    this.createProjectileImagePools();
    this.createProjectilePool();
    this.resizeCamera(this.scale.width, this.scale.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize: Phaser.Structs.Size) => this.resizeCamera(gameSize.width, gameSize.height));
    this.aimCorridor = this.add.rectangle(0, 0, 1, AIM_GUIDE_LINE_WIDTH, 0xffe6a3, 0.9).setOrigin(0, 0.5).setDepth(8).setVisible(false);
    this.exclusiveSkillIndicatorGraphics = this.add.graphics().setDepth(8).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.capturePointGraphics = this.add.graphics().setDepth(-3).setBlendMode(Phaser.BlendModes.ADD);
    this.capturePointPulse = this.add.circle(1_440, 810, 220, 0x4da3ff, 0.03)
      .setStrokeStyle(6, 0x4da3ff, 0.36)
      .setDepth(-2);
    this.aimEnd = this.add.circle(0, 0, 5, 0xfff1bf, 0.9).setStrokeStyle(2, 0xff8c58, 0.95).setDepth(9).setVisible(false);
    this.ready = true;
    if (this.snapshot) this.syncSnapshot(this.snapshot);
  }

  override update(_time: number, delta: number): void {
    const now = performance.now();
    const latest = this.snapshot;
    const sample = latest
      ? this.snapshotBuffer.sample(latest.serverTime + (now - this.latestSnapshotReceivedAt) - this.renderDelayMs)
      : null;
    if (sample) {
      this.applyInterpolatedPositions(sample.older, sample.newer, sample.alpha);
      this.syncBufferedProjectiles(sample.older, sample.newer, sample.alpha);
    }

    for (const [id, view] of this.playerViews) {
      const player = latest?.players.find((candidate) => candidate.id === id);
      if (id === this.localPlayerId && this.localPlayerCanMove()) {
        const moveSpeed = player?.moveSpeed;
        const predicted = predictLocalPosition(view.container, this.localInput, delta, moveSpeed);
        view.container.setPosition(predicted.x, predicted.y);
        this.consumeCorrection(view.container, delta);
      } else if (id === this.localPlayerId) {
        this.consumeCorrection(view.container, delta);
      }
      if (player) this.updatePlayerVisual(view, player, now);
      if (view.shield) view.shield.setPosition(view.container.x, view.container.y);
    }
    this.updateCamera();
    this.updateAimGuide();
    this.updateExclusiveSkillIndicator();
  }

  applySnapshot(snapshot: GameSnapshot): void {
    if (this.snapshot && snapshot.serverTime < this.snapshot.serverTime) return;
    if (this.snapshot === snapshot) return;
    if (
      this.snapshot &&
      snapshot.serverTime === this.snapshot.serverTime &&
      snapshot.phase === this.snapshot.phase &&
      snapshot.holderId === this.snapshot.holderId &&
      snapshot.finishedAt === this.snapshot.finishedAt &&
      snapshot.winnerIds.join(",") === this.snapshot.winnerIds.join(",")
    ) return;
    const advancesAnchor = shouldAdvanceSnapshotAnchor(this.snapshot?.serverTime ?? null, snapshot.serverTime);
    this.snapshot = snapshot;
    this.snapshotBuffer.push(snapshot);
    if (advancesAnchor) this.latestSnapshotReceivedAt = performance.now();
    if (this.ready) this.syncSnapshot(snapshot);
  }

  setLocalPlayerId(playerId: string | null): void {
    this.localPlayerId = playerId;
    if (this.snapshot && this.ready) this.syncSnapshot(this.snapshot);
  }

  setLocalInput(input: Vec2): void {
    this.localInput = input;
  }

  setLocalAim(input: Vec2): void {
    this.localAim = input;
  }

  setExclusiveSkillPreview(state: SkillIndicatorState | null): void {
    this.exclusiveSkillPreview = state ? {
      ...state,
      origin: { ...state.origin },
      direction: { ...state.direction },
    } : null;
    if (!state) this.exclusiveSkillIndicatorGraphics?.setVisible(false).clear();
  }

  addLocalInput(input: PlayerInput, deltaMs: number): void {
    this.inputReconciler.add(input, deltaMs);
  }

  resetLocalInputs(): void {
    this.inputReconciler.reset();
    this.localInput = { x: 0, y: 0 };
    this.localAim = { x: 0, y: 0 };
    this.correctionRemaining = { x: 0, y: 0 };
  }

  private localPlayerCanMove(): boolean {
    if (!this.snapshot || (this.snapshot.phase !== "playing" && this.snapshot.phase !== "overtime")) return false;
    return this.snapshot.players.find((player) => player.id === this.localPlayerId)?.alive === true;
  }

  private drawArena(): void {
    const perimeterPadding = VIEW_WIDTH;
    this.add
      .rectangle(
        ARENA_WIDTH / 2,
        ARENA_HEIGHT / 2,
        ARENA_WIDTH + perimeterPadding * 2,
        ARENA_HEIGHT + perimeterPadding * 2,
        0x030711,
        1,
      )
      .setDepth(-20);
    const perimeterGrid = this.add.graphics().setDepth(-19).lineStyle(2, 0x24587a, 0.07);
    for (let x = -perimeterPadding; x <= ARENA_WIDTH + perimeterPadding; x += 160) {
      perimeterGrid.lineBetween(x, -perimeterPadding, x, ARENA_HEIGHT + perimeterPadding);
    }
    for (let y = -perimeterPadding; y <= ARENA_HEIGHT + perimeterPadding; y += 160) {
      perimeterGrid.lineBetween(-perimeterPadding, y, ARENA_WIDTH + perimeterPadding, y);
    }
    this.add.tileSprite(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, "arena-floor-v3").setDepth(-10).setTint(0x7185b0);
    const grid = this.add.graphics();
    grid.setDepth(-8).lineStyle(2, 0x6ce5ff, 0.045);
    for (let x = 0; x <= ARENA_WIDTH; x += 80) grid.lineBetween(x, 0, x, ARENA_HEIGHT);
    for (let y = 0; y <= ARENA_HEIGHT; y += 80) grid.lineBetween(0, y, ARENA_WIDTH, y);

    const lanes = this.add.graphics().setDepth(-7);
    lanes.lineStyle(5, 0xffad42, 0.32);
    lanes.strokeCircle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 178);
    lanes.lineStyle(4, 0x44e1ff, 0.22);
    lanes.strokeRoundedRect(110, 90, ARENA_WIDTH - 220, ARENA_HEIGHT - 180, 70);
    lanes.lineStyle(18, 0x209dff, 0.09);
    lanes.lineBetween(180, ARENA_HEIGHT / 2, 720, ARENA_HEIGHT / 2);
    lanes.lineBetween(ARENA_WIDTH - 720, ARENA_HEIGHT / 2, ARENA_WIDTH - 180, ARENA_HEIGHT / 2);
    lanes.lineStyle(10, 0xff5a5f, 0.07);
    lanes.strokeRoundedRect(820, 405, 520, 405, 48);

    const decalPositions = [
      [ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 1.45],
      [330, 280, 0.85],
      [ARENA_WIDTH - 330, ARENA_HEIGHT - 280, 0.85],
      [ARENA_WIDTH - 360, 310, 0.72],
      [360, ARENA_HEIGHT - 310, 0.72],
    ] as const;
    for (const [x, y, scale] of decalPositions) {
      this.add.image(x, y, "arena-decal-v3").setDepth(-6).setScale(scale).setAlpha(0.54).setTint(0x74dfff);
    }
    this.add.image(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, "arena-sigil").setDepth(-5).setAlpha(0.18).setScale(1.55);
    for (const [x, y] of [[420, 360], [ARENA_WIDTH - 420, 360], [420, ARENA_HEIGHT - 360], [ARENA_WIDTH - 420, ARENA_HEIGHT - 360]] as const) {
      const light = this.add.image(x, y, "arena-light-v3").setDepth(-4).setScale(3.4).setAlpha(0.42).setTint(0x3adfff).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: light, alpha: 0.1, scale: 2.6, duration: 1_800, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
    const map = getMapDefinition(this.mapId);
    const wallTint = map.theme === "neon" ? 0x7c6cff : map.theme === "crystal" ? 0x8f7dff : 0x7393a8;
    for (const wall of map.walls) {
      this.add.rectangle(wall.x + wall.width / 2 + 12, wall.y + wall.height / 2 + 13, wall.width, wall.height, 0x000000, 0.4).setDepth(-2);
      this.add.tileSprite(wall.x + wall.width / 2, wall.y + wall.height / 2, wall.width, wall.height, "arena-wall-v3")
        .setDepth(-1)
        .setTint(wallTint);
      this.add.rectangle(wall.x + wall.width / 2, wall.y + wall.height / 2, wall.width, wall.height, 0x000000, 0)
        .setDepth(0)
        .setStrokeStyle(5, 0x8bdcf2, 0.92);
    }
    this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH - 10, ARENA_HEIGHT - 10)
      .setStrokeStyle(10, 0x050708, 1)
      .setFillStyle(0x000000, 0);
  }

  private syncSnapshot(snapshot: GameSnapshot): void {
    const activePlayers = new Set(snapshot.players.map((player) => player.id));
    let localPlayerRespawned = false;
    for (const [id, view] of this.playerViews) {
      if (!activePlayers.has(id)) {
        if (view.shield) view.shield.setVisible(false);
        this.destroyExclusiveEffectView(id);
        view.container.destroy(true);
        this.playerViews.delete(id);
      }
    }

    for (const player of snapshot.players) {
      const view = this.playerViews.get(player.id) ?? this.createPlayerView(player);
      if (player.id === this.localPlayerId) {
        localPlayerRespawned = shouldSnapCameraOnRespawn(view.wasAlive, player.alive);
        if (localPlayerRespawned) {
          view.container.setPosition(player.x, player.y);
          this.correctionRemaining = { x: 0, y: 0 };
        }
        const current = { x: view.container.x, y: view.container.y };
        const reconciliation = this.inputReconciler.reconcile(player, current);
        if (reconciliation.correctionDistance > 80) {
          view.container.setPosition(reconciliation.position.x, reconciliation.position.y);
          this.correctionRemaining = { x: 0, y: 0 };
        } else {
          this.correctionRemaining = {
            x: reconciliation.position.x - current.x,
            y: reconciliation.position.y - current.y,
          };
        }
      }
      const now = performance.now();
      view.aim.rotation = player.angle;
      view.sprite.setRotation(0);
      const weaponTransform = resolveWeaponTransform(player.angle, PLAYER_RADIUS + 10);
      view.weapon.setRotation(weaponTransform.rotation).setPosition(weaponTransform.x, weaponTransform.y);
      view.container.setAlpha(player.alive ? 1 : 0.62);
      view.name.setText(player.isBot ? `${player.nickname} · AI` : player.nickname);
      view.healthFill.width = 72 * (player.health / player.maxHealth);
      view.healthFill.setFillStyle(player.health <= 25 ? 0xff5a5f : 0x31d0aa);
      this.syncShield(view, player, snapshot.serverTime);
      view.sprite.setTint(player.id === this.localPlayerId ? 0xffffff : 0xf2f6f8);
      if (player.health < view.lastHealth && player.alive) {
        view.hitUntil = now + 180;
        this.playCombatEffect("hit", view.container.x, view.container.y, 0xff5a5f);
        if (player.id === this.localPlayerId) this.audio.playHurt();
      } else if (player.health > view.lastHealth && player.alive && now - view.lastHealEffectAt >= 500) {
        view.lastHealEffectAt = now;
        this.playCombatEffect("heal", view.container.x, view.container.y, 0x66ffd1);
      }
      if (!view.wasAlive && player.alive) this.playCombatEffect("respawn", view.container.x, view.container.y, Phaser.Display.Color.HexStringToColor(player.color).color);
      const speed = Math.hypot(player.vx, player.vy);
      if (speed > player.moveSpeed * 1.12 && now - view.lastDashEffectAt > 160) {
        view.lastDashEffectAt = now;
        this.playCombatEffect("dash", view.container.x, view.container.y, Phaser.Display.Color.HexStringToColor(player.color).color);
      }
      view.lastHealth = player.health;
      view.wasAlive = player.alive;
      this.updatePlayerVisual(view, player, now);
      this.syncExclusiveSkillEffect(player);
    }

    if (localPlayerRespawned) this.updateCamera();

    this.syncEnergy(snapshot);
    this.syncSkillOrbs(snapshot);
    this.syncCapturePoint(snapshot.capturePoint ?? null);
  }

  private syncCapturePoint(point: CapturePointSnapshot | null): void {
    const graphics = this.capturePointGraphics;
    const pulse = this.capturePointPulse;
    if (!graphics || !pulse || !point) {
      graphics?.clear().setVisible(false);
      pulse?.setVisible(false);
      return;
    }
    const colors = { red: 0xff5a5f, blue: 0x4da3ff, gold: 0xffd166 } as const;
    const ownerColor = point.ownerTeamId ? colors[point.ownerTeamId] : 0x8ca4b3;
    const progress = Math.max(0, Math.min(1, point.progress / Math.max(1, point.targetProgress)));
    graphics.clear().setVisible(true);
    graphics.lineStyle(12, 0x071019, 0.82).strokeCircle(point.x, point.y, point.radius);
    graphics.lineStyle(7, ownerColor, point.state === "contested" ? 0.52 : 0.9);
    if (progress > 0) graphics.arc(point.x, point.y, point.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
    graphics.lineStyle(4, 0xdff7ff, point.state === "contested" ? 0.86 : 0.45).strokeCircle(point.x, point.y, point.radius * 0.72);
    pulse.setVisible(true).setPosition(point.x, point.y).setRadius(point.radius).setStrokeStyle(6, ownerColor, point.state === "contested" ? 0.78 : 0.28);
    pulse.setAlpha(point.state === "contested" ? 0.9 : 0.55);
  }

  private syncExclusiveSkillEffect(player: PlayerSnapshot): void {
    const state = player.exclusiveSkillState;
    if (!state) {
      this.exclusiveEffectRevisions.delete(player.id);
      this.destroyExclusiveEffectView(player.id);
      return;
    }
    const revision = `${state.skillId}:${state.startedAt}`;
    let effect = this.exclusiveEffectViews.get(player.id);
    if (!effect || this.exclusiveEffectRevisions.get(player.id) !== revision) {
      this.destroyExclusiveEffectView(player.id);
      effect = this.createExclusiveEffectView(player, state.skillId, state.startedAt);
      this.exclusiveEffectViews.set(player.id, effect);
      this.exclusiveEffectRevisions.set(player.id, revision);
    }
    this.updateExclusiveEffectView(effect, player);
  }

  private createExclusiveEffectView(player: PlayerSnapshot, skillId: ExclusiveSkillId, startedAt: number): ExclusiveEffectView {
    const profile = getExclusiveEffectProfile(skillId);
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const sprite = this.add.image(0, 0, `exclusive-fx:${player.characterId}`)
      .setDisplaySize(profile.innerRadius * 2.45, profile.innerRadius * 2.45)
      .setAlpha(0.82)
      .setBlendMode(Phaser.BlendModes.ADD);
    const inner = this.add.circle(0, 0, profile.innerRadius, color, 0.12)
      .setStrokeStyle(5, 0xffffff, 0.72)
      .setBlendMode(Phaser.BlendModes.ADD);
    const outer = this.add.circle(0, 0, profile.outerRadius, color, 0.055)
      .setStrokeStyle(skillId === "mobile-bulwark" ? 10 : 6, color, 0.72)
      .setBlendMode(Phaser.BlendModes.ADD);
    const orbit = this.add.circle(0, 0, Math.min(profile.outerRadius * 0.82, profile.innerRadius + 44), 0xffffff, 0)
      .setStrokeStyle(3, 0xffffff, 0.52)
      .setBlendMode(Phaser.BlendModes.ADD);
    const graphics = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const container = this.add.container(player.x, player.y, [outer, inner, orbit, sprite, graphics]).setDepth(6);
    this.tweens.add({ targets: inner, scale: 1.22, alpha: 0.22, duration: profile.pulseMs, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    this.tweens.add({ targets: outer, scale: 1.08, alpha: 0.36, duration: profile.pulseMs * 1.35, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    this.tweens.add({ targets: orbit, angle: 360, duration: profile.rotationMs, repeat: -1, ease: "Linear" });
    this.tweens.add({ targets: sprite, angle: skillId === "afterimage-run" ? -8 : 12, scale: 1.12, alpha: 0.48, duration: profile.pulseMs * 0.8, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    return { container, sprite, inner, outer, orbit, graphics, skillId, startedAt };
  }

  private updateExclusiveEffectView(effect: ExclusiveEffectView, player: PlayerSnapshot): void {
    const state = player.exclusiveSkillState;
    if (!state) return;
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const graphics = effect.graphics;
    effect.container.setPosition(player.x, player.y);
    graphics.clear().fillStyle(color, 0.16).lineStyle(effect.skillId === "mobile-bulwark" ? 12 : 7, color, 0.88);
    if (effect.skillId === "breach" && state.anchor) {
      const localAnchor = { x: state.anchor.x - player.x, y: state.anchor.y - player.y };
      graphics.lineBetween(0, 0, localAnchor.x, localAnchor.y);
      graphics.fillCircle(localAnchor.x, localAnchor.y, 24);
      graphics.lineStyle(5, 0xffefb4, 0.92).strokeCircle(localAnchor.x, localAnchor.y, 38);
    } else if (effect.skillId === "pulse-heal") {
      graphics.strokeCircle(0, 0, 280);
      graphics.lineStyle(4, 0xe6fff6, 0.72).strokeCircle(0, 0, 150);
      for (let index = 0; index < 4; index += 1) {
        const angle = (Math.PI * 2 * index) / 4;
        graphics.fillCircle(Math.cos(angle) * 92, Math.sin(angle) * 92, 13);
      }
    } else if (effect.skillId === "mobile-bulwark") {
      graphics.beginPath();
      graphics.moveTo(0, 0);
      graphics.arc(0, 0, 170, player.angle - 0.72, player.angle + 0.72, false);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      graphics.lineStyle(5, 0xffffff, 0.62).strokeCircle(0, 0, 280);
    } else if (effect.skillId === "capacitor-overload") {
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8 + player.angle;
        const innerRadius = 62 + (index % 2) * 8;
        graphics.lineBetween(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, Math.cos(angle) * 112, Math.sin(angle) * 112);
      }
      graphics.lineStyle(4, 0xffffff, 0.84).strokeCircle(0, 0, 84);
    } else if (effect.skillId === "afterimage-run") {
      for (let index = 1; index <= 3; index += 1) {
        const x = -Math.cos(player.angle) * index * 48;
        const y = -Math.sin(player.angle) * index * 48;
        graphics.fillEllipse(x, y, 96 - index * 14, 48 - index * 6);
      }
      graphics.lineStyle(5, 0xffffff, 0.64).lineBetween(-Math.cos(player.angle) * 170, -Math.sin(player.angle) * 170, Math.cos(player.angle) * 70, Math.sin(player.angle) * 70);
    } else {
      const backwardX = -Math.cos(player.angle) * 150;
      const backwardY = -Math.sin(player.angle) * 150;
      graphics.lineBetween(backwardX, backwardY, 0, 0);
      graphics.fillCircle(backwardX, backwardY, 28);
    }
  }

  private destroyExclusiveEffectView(playerId: string): void {
    const effect = this.exclusiveEffectViews.get(playerId);
    if (!effect) return;
    this.tweens.killTweensOf([effect.inner, effect.outer, effect.orbit, effect.sprite]);
    effect.container.destroy(true);
    this.exclusiveEffectViews.delete(playerId);
  }

  private createPlayerView(player: PlayerSnapshot): PlayerView {
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const shadow = this.add.ellipse(5, 17, PLAYER_RADIUS * 2.8, PLAYER_RADIUS * 1.55, 0x000000, 0.42);
    const ring = this.add.circle(0, 3, PLAYER_RADIUS + 12, color, 0.08).setStrokeStyle(4, color, 0.78);
    const initialDirection = characterDirectionFromAngle(player.angle);
    const sprite = this.add.sprite(
      0,
      0,
      resolveCharacterDirectionTextureKey(player.characterId, initialDirection, "idle", this.failedTextureKeys),
    ).setDisplaySize(104, 104);
    const weapon = this.add.image(PLAYER_RADIUS + 10, 0, `weapon:${characterWeaponKind(player.characterId)}`)
      .setDisplaySize(68, 68)
      .setOrigin(0.5, 0.5);
    const aim = this.add.rectangle(PLAYER_RADIUS + 19, 0, 38, 11, 0xffffff, 0.95).setOrigin(0, 0.5).setVisible(false);
    const healthBg = this.add.rectangle(-36, 51, 72, 7, 0x07090b, 0.88).setOrigin(0, 0.5);
    const healthFill = this.add.rectangle(-36, 51, 72, 7, 0x31d0aa, 1).setOrigin(0, 0.5);
    const name = this.add
      .text(0, -47, player.nickname, {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: "19px",
        color: "#ffffff",
        stroke: "#050708",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setY(-58);
    const childrenByLayer = { shadow, ring, sprite, weapon, aim, "health-bg": healthBg, "health-fill": healthFill, name };
    const container = this.add.container(
      player.x,
      player.y,
      getPlayerChildLayerOrder().map((layer) => childrenByLayer[layer]),
    ).setDepth(4);
    // Keep this relationship explicit: Phaser renders later Container children on top,
    // while the HUD labels remain above both gameplay sprites.
    container.moveAbove(weapon, sprite);
    const view: PlayerView = {
      container,
      sprite,
      weapon,
      aim,
      name,
      healthFill,
      shadow,
      ring,
      shield: null,
      lastHealth: player.health,
      wasAlive: player.alive,
      attackUntil: 0,
      hitUntil: 0,
      lastDashEffectAt: 0,
      lastHealEffectAt: 0,
      visualState: "idle",
      direction: initialDirection,
    };
    this.playerViews.set(player.id, view);
    return view;
  }

  private syncEnergy(snapshot: GameSnapshot): void {
    const active = new Set(snapshot.energy.map((energy) => energy.id));
    for (const [id, sprite] of this.energyViews) {
      if (!active.has(id)) {
        this.energyViews.delete(id);
        this.tweens.add({ targets: sprite, scale: 1.5, alpha: 0, duration: 160, onComplete: () => sprite.destroy() });
      }
    }
    for (const energy of snapshot.energy) {
      if (this.energyViews.has(energy.id)) continue;
      const sprite = this.add.sprite(energy.x, energy.y, "energy-core").setScale(0.5).setDepth(2);
      this.energyViews.set(energy.id, sprite);
      this.tweens.add({ targets: sprite, scale: 0.58, duration: 720, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
  }

  private syncSkillOrbs(snapshot: GameSnapshot): void {
    const active = new Set(snapshot.skillOrbs.map((orb) => orb.id));
    for (const [id, container] of this.skillOrbViews) {
      if (active.has(id)) continue;
      this.skillOrbViews.delete(id);
      this.tweens.add({ targets: container, scale: 1.35, alpha: 0, duration: 180, onComplete: () => container.destroy(true) });
    }
    for (const orb of snapshot.skillOrbs) {
      if (this.skillOrbViews.has(orb.id)) continue;
      const color = SKILL_COLORS[orb.type];
      const ground = this.add.ellipse(0, 22, 92, 34, color, 0.24).setStrokeStyle(4, color, 0.62);
      const glow = this.add.circle(0, 0, 43, color, 0.2).setStrokeStyle(5, color, 0.9);
      const beam = this.add.rectangle(0, -40, 34, 122, color, 0.16).setOrigin(0.5, 1);
      const icon = this.add.image(0, 0, `skill-${orb.type}`).setDisplaySize(54, 54);
      const container = this.add.container(orb.x, orb.y, [beam, ground, glow, icon]).setDepth(3);
      this.skillOrbViews.set(orb.id, container);
      this.tweens.add({ targets: glow, scale: 1.24, alpha: 0.68, duration: 620, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      this.tweens.add({ targets: icon, y: -10, angle: 4, duration: 760, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
  }

  private syncBufferedProjectiles(older: GameSnapshot, newer: GameSnapshot, alpha: number): void {
    const lifecycleSnapshot = alpha < 1 ? older : newer;
    const active = new Set(lifecycleSnapshot.projectiles.map((projectile) => projectile.id));
    for (const [id, view] of this.projectileViews) {
      if (!active.has(id)) {
        this.playProjectileImpact(view);
        this.projectilePool?.release(view);
        this.projectileViews.delete(id);
      }
    }
    for (const projectile of lifecycleSnapshot.projectiles) {
      let view = this.projectileViews.get(projectile.id);
      if (!view) {
        const owner = lifecycleSnapshot.players.find((player) => player.id === projectile.ownerId);
        const color = Phaser.Display.Color.HexStringToColor(owner?.color ?? "#ffffff").color;
        const acquired = this.projectilePool?.acquire((item) => {
          item.ownerId = projectile.ownerId;
          item.color = color;
          item.lastTrail = { x: projectile.x, y: projectile.y, emittedAt: performance.now() };
          item.container
            .setPosition(projectile.x, projectile.y)
            .setRotation(projectileAngle({ x: projectile.vx, y: projectile.vy }))
            .setVisible(true)
            .setActive(true);
          item.core.setFillStyle(0xffffff, 1).setStrokeStyle(3, color, 1);
          item.glow.setFillStyle(color, 0.48);
          item.coreSprite.setTint(color).setAlpha(1);
          item.traceSprite.setTint(color).setAlpha(0.86).setVisible(shouldShowProjectileTrace(false));
        });
        if (!acquired) continue;
        view = acquired;
        this.projectileViews.set(projectile.id, view);
        if (owner) {
          const ownerView = this.playerViews.get(owner.id);
          if (ownerView) ownerView.attackUntil = performance.now() + 150;
          const muzzleX = owner.x + Math.cos(owner.angle) * 50;
          const muzzleY = owner.y + Math.sin(owner.angle) * 50;
          this.playCombatEffect("muzzle", muzzleX, muzzleY, color);
          this.playProjectileImageEffect("muzzle", muzzleX, muzzleY, color, owner.angle);
          const localView = this.localPlayerId ? this.playerViews.get(this.localPlayerId) : null;
          this.audio.playFire({
            local: owner.id === this.localPlayerId,
            sourceId: owner.id,
            distance: localView ? Math.hypot(owner.x - localView.container.x, owner.y - localView.container.y) : 1_200,
          });
        }
      }
      const start = older.projectiles.find((candidate) => candidate.id === projectile.id) ?? projectile;
      const end = newer.projectiles.find((candidate) => candidate.id === projectile.id) ?? start;
      const x = Phaser.Math.Linear(start.x, end.x, alpha);
      const y = Phaser.Math.Linear(start.y, end.y, alpha);
      view.container.setPosition(x, y).setRotation(projectileAngle({ x: projectile.vx, y: projectile.vy }));
      if (shouldEmitProjectileTrail(view.lastTrail, { x, y }, performance.now(), false)) {
        this.playCombatEffect("trail", x, y, view.color);
        this.playProjectileImageEffect("trail", x, y, view.color, projectileAngle({ x: projectile.vx, y: projectile.vy }));
        view.lastTrail = { x, y, emittedAt: performance.now() };
      }
    }
  }

  private applyInterpolatedPositions(older: GameSnapshot, newer: GameSnapshot, alpha: number): void {
    for (const [id, view] of this.playerViews) {
      if (id === this.localPlayerId) continue;
      const olderPlayer = older.players.find((player) => player.id === id);
      const newerPlayer = newer.players.find((player) => player.id === id);
      if (!olderPlayer && !newerPlayer) continue;
      const start = olderPlayer ?? newerPlayer!;
      const end = newerPlayer ?? olderPlayer!;
      view.container.setPosition(
        Phaser.Math.Linear(start.x, end.x, alpha),
        Phaser.Math.Linear(start.y, end.y, alpha),
      );
    }
  }

  private consumeCorrection(object: Phaser.GameObjects.Container, deltaMs: number): void {
    const result = consumePositionCorrection(
      { x: object.x, y: object.y },
      this.correctionRemaining,
      deltaMs,
    );
    object.setPosition(result.position.x, result.position.y);
    this.correctionRemaining = result.remaining;
  }

  private updateExclusiveSkillIndicator(): void {
    const graphics = this.exclusiveSkillIndicatorGraphics;
    const preview = this.exclusiveSkillPreview;
    const player = this.snapshot?.players.find((candidate) => candidate.id === this.localPlayerId);
    const view = this.localPlayerId ? this.playerViews.get(this.localPlayerId) : null;
    if (!graphics || !preview?.visible || !player?.alive || !view || !preview.skillId) {
      graphics?.setVisible(false).clear();
      return;
    }

    const profile = getSkillIndicatorProfile(preview.skillId);
    const directionLength = Math.hypot(preview.direction.x, preview.direction.y);
    const direction = directionLength > 0.08
      ? { x: preview.direction.x / directionLength, y: preview.direction.y / directionLength }
      : { x: Math.cos(player.angle), y: Math.sin(player.angle) };
    const origin = { x: view.container.x, y: view.container.y };
    const angle = Math.atan2(direction.y, direction.x);
    graphics.clear().setVisible(true);
    graphics.fillStyle(profile.color, 0.11);
    graphics.lineStyle(profile.thickness, profile.color, 0.42);

    const activeAnchor = preview.skillId === "blaze" && player.exclusiveSkillState?.skillId === "breach"
      ? player.exclusiveSkillState.anchor
      : undefined;
    if (activeAnchor) {
      graphics.lineBetween(origin.x, origin.y, activeAnchor.x, activeAnchor.y);
      graphics.fillCircle(activeAnchor.x, activeAnchor.y, 24);
      graphics.lineStyle(5, 0xfff2c2, 0.96).strokeCircle(activeAnchor.x, activeAnchor.y, 38);
      graphics.lineStyle(3, profile.color, 0.88).strokeCircle(activeAnchor.x, activeAnchor.y, 54);
      return;
    }

    const target = { x: origin.x + direction.x * profile.range, y: origin.y + direction.y * profile.range };
    switch (profile.shape) {
      case "dash-line":
      case "phase-line": {
        const sideX = -direction.y * 24;
        const sideY = direction.x * 24;
        graphics.lineStyle(profile.thickness + 18, profile.color, 0.14);
        graphics.lineBetween(origin.x, origin.y, target.x, target.y);
        graphics.lineStyle(profile.thickness, profile.color, 0.7);
        graphics.lineBetween(origin.x, origin.y, target.x, target.y);
        graphics.fillCircle(target.x, target.y, profile.shape === "phase-line" ? 30 : 24);
        graphics.lineStyle(5, 0xffffff, 0.82).strokeCircle(target.x, target.y, profile.shape === "phase-line" ? 46 : 36);
        graphics.fillStyle(0xffffff, 0.92).fillTriangle(
          target.x + direction.x * 18,
          target.y + direction.y * 18,
          target.x - direction.x * 28 + sideX,
          target.y - direction.y * 28 + sideY,
          target.x - direction.x * 28 - sideX,
          target.y - direction.y * 28 - sideY,
        );
        graphics.lineStyle(4, profile.color, 0.9).strokeCircle(origin.x, origin.y, 34);
        break;
      }
      case "heal-radius":
        graphics.fillCircle(origin.x, origin.y, 52);
        graphics.strokeCircle(origin.x, origin.y, profile.range);
        graphics.lineStyle(5, 0xcffff0, 0.8).strokeCircle(origin.x, origin.y, profile.range * 0.55);
        break;
      case "front-cone":
        graphics.beginPath();
        graphics.moveTo(origin.x, origin.y);
        graphics.arc(origin.x, origin.y, profile.range, angle - 0.72, angle + 0.72, false);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
        break;
      case "buff-aura":
        graphics.fillCircle(origin.x, origin.y, profile.range * 0.55);
        graphics.strokeCircle(origin.x, origin.y, profile.range);
        graphics.lineStyle(5, 0xffffff, 0.75).strokeCircle(origin.x, origin.y, profile.range * 0.72);
        for (let index = 0; index < 6; index += 1) {
          const ray = (Math.PI * 2 * index) / 6;
          graphics.lineBetween(origin.x + Math.cos(ray) * 55, origin.y + Math.sin(ray) * 55, origin.x + Math.cos(ray) * 105, origin.y + Math.sin(ray) * 105);
        }
        break;
      case "afterimage-lane": {
        const sideX = -direction.y * 54;
        const sideY = direction.x * 54;
        graphics.beginPath();
        graphics.moveTo(origin.x + sideX, origin.y + sideY);
        graphics.lineTo(target.x + sideX, target.y + sideY);
        graphics.lineTo(target.x - sideX, target.y - sideY);
        graphics.lineTo(origin.x - sideX, origin.y - sideY);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
        graphics.fillTriangle(target.x, target.y, target.x - direction.x * 48 + sideX * 0.6, target.y - direction.y * 48 + sideY * 0.6, target.x - direction.x * 48 - sideX * 0.6, target.y - direction.y * 48 - sideY * 0.6);
        break;
      }
    }
  }

  private updateAimGuide(): void {
    if (!this.aimCorridor || !this.aimEnd || !this.snapshot) return;
    const view = this.localPlayerId ? this.playerViews.get(this.localPlayerId) : null;
    const player = this.snapshot.players.find((candidate) => candidate.id === this.localPlayerId);
    const guide = view && player?.alive && this.snapshot.phase !== "finished"
      ? calculateAimGuide(view.container, this.localAim, PROJECTILE_MAX_DISTANCE, getMapDefinition(this.mapId).walls)
      : { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, angle: 0, length: 0, visible: false };
    this.aimCorridor.setVisible(guide.visible).setPosition(guide.start.x, guide.start.y).setRotation(guide.angle).setSize(guide.length, AIM_GUIDE_LINE_WIDTH).setDisplaySize(guide.length, AIM_GUIDE_LINE_WIDTH);
    this.aimEnd.setVisible(guide.visible).setPosition(guide.end.x, guide.end.y);
  }

  private createGeneratedFallbackTextures(): void {
    for (const character of CHARACTER_CATALOG) {
      const key = characterTextureKey(character.id, "generated-fallback");
      if (this.textures.exists(key)) continue;
      const color = Phaser.Display.Color.HexStringToColor(character.color).color;
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0x091015, 0.72).fillCircle(48, 51, 34);
      graphics.fillStyle(color, 1).fillRoundedRect(19, 23, 58, 54, 18);
      graphics.fillStyle(0xeaf7ff, 0.92).fillCircle(37, 45, 6).fillCircle(59, 45, 6);
      graphics.lineStyle(5, 0xffffff, 0.75).strokeCircle(48, 50, 35);
      graphics.generateTexture(key, 96, 96);
      graphics.destroy();
    }
  }

  private createProjectilePool(): void {
    this.projectilePool = new ReusableObjectPool(
      PROJECTILE_VIEW_CAPACITY,
      () => {
        const glow = this.add.circle(0, 0, 19, 0xffffff, 0.42).setBlendMode(Phaser.BlendModes.ADD);
        const core = this.add.circle(0, 0, 8, 0xffffff, 1).setStrokeStyle(3, 0xffffff, 0.95);
        const coreSprite = this.add.image(0, 0, "fx-projectile-core").setDisplaySize(30, 30).setBlendMode(Phaser.BlendModes.ADD);
        const traceSprite = this.add.image(-42, 0, "fx-projectile-trace").setDisplaySize(42, 110).setRotation(-Math.PI / 2).setBlendMode(Phaser.BlendModes.ADD);
        const container = this.add.container(0, 0, [traceSprite, glow, coreSprite, core])
          .setDepth(6)
          .setVisible(false)
          .setActive(false);
        return {
          container,
          glow,
          core,
          coreSprite,
          traceSprite,
          ownerId: "",
          color: 0xffffff,
          lastTrail: { x: 0, y: 0, emittedAt: 0 },
        };
      },
      (view) => {
        this.tweens.killTweensOf(view.container);
        view.container.setVisible(false).setActive(false).setPosition(0, 0).setRotation(0);
        view.ownerId = "";
        view.color = 0xffffff;
        view.coreSprite.clearTint().setAlpha(1);
        view.traceSprite.clearTint().setAlpha(1).setVisible(false);
        view.lastTrail = { x: 0, y: 0, emittedAt: 0 };
      },
    );
  }

  private createProjectileImagePools(): void {
    const textureKeys = {
      muzzle: "fx-muzzle-flare",
      trail: "fx-projectile-trace",
      impact: "fx-impact-burst",
      spark: "fx-impact-spark",
      smoke: "fx-impact-smoke",
    } as const;
    const capacities = { muzzle: 24, trail: 160, impact: 36, spark: 96, smoke: 36 } as const;
    const makePool = (kind: keyof typeof textureKeys): FixedObjectPool<Phaser.GameObjects.Image> => new FixedObjectPool(
      capacities[kind],
      () => this.add.image(0, 0, textureKeys[kind]).setDepth(kind === "trail" ? 2 : 7).setVisible(false).setActive(false).setBlendMode(Phaser.BlendModes.ADD),
      (image) => {
        this.tweens.killTweensOf(image);
        image.setVisible(false).setActive(false).setAlpha(1).setScale(1).setRotation(0).clearTint().setPosition(0, 0);
      },
    );
    this.projectileImagePools = {
      muzzle: makePool("muzzle"),
      trail: makePool("trail"),
      impact: makePool("impact"),
      spark: makePool("spark"),
      smoke: makePool("smoke"),
    };
  }

  private playProjectileImageEffect(
    kind: "muzzle" | "trail" | "impact" | "spark" | "smoke",
    x: number,
    y: number,
    color: number,
    angle = 0,
  ): void {
    if (!shouldRenderProjectileImageEffect(kind, false)) return;
    const pool = this.projectileImagePools?.[kind];
    if (!pool) return;
    const image = pool.acquire((item) => {
      item.setPosition(x, y).setTint(color).setVisible(true).setActive(true);
      if (kind === "muzzle") item.setDisplaySize(104, 54).setRotation(angle);
      if (kind === "trail") item.setDisplaySize(14, 86).setRotation(angle - Math.PI / 2).setPosition(x - Math.cos(angle) * 28, y - Math.sin(angle) * 28);
      if (kind === "impact") item.setDisplaySize(94, 94).setRotation(Math.random() * Math.PI * 2);
      if (kind === "spark") item.setDisplaySize(64, 64).setRotation(Math.random() * Math.PI * 2);
      if (kind === "smoke") item.setDisplaySize(76, 76).setRotation(Math.random() * Math.PI * 2);
    });
    const duration = kind === "muzzle" ? 110 : kind === "trail" ? 150 : kind === "impact" ? 260 : kind === "smoke" ? 360 : 180;
    const scale = kind === "muzzle" ? 1.18 : kind === "trail" ? 0.55 : kind === "impact" ? 1.35 : kind === "smoke" ? 1.55 : 0.7;
    this.tweens.add({ targets: image, alpha: 0, scale, duration, ease: "Cubic.Out", onComplete: () => image.setVisible(false).setActive(false) });
  }

  private createEffectPools(): void {
    const makePool = (kind: CombatEffectKind): FixedObjectPool<Phaser.GameObjects.Arc> => new FixedObjectPool(
      effectCapacity(kind),
      () => this.add.circle(0, 0, 10, 0xffffff, 0).setDepth(kind === "trail" ? 2 : 7).setVisible(false),
      (effect) => {
        this.tweens.killTweensOf(effect);
        effect.setVisible(false).setAlpha(1).setScale(1).setFillStyle(0xffffff, 0).setStrokeStyle(0, 0xffffff, 0);
      },
    );
    this.effectPools = {
      muzzle: makePool("muzzle"),
      trail: makePool("trail"),
      impact: makePool("impact"),
      spark: makePool("spark"),
      hit: makePool("hit"),
      shield: makePool("shield"),
      dash: makePool("dash"),
      heal: makePool("heal"),
      respawn: makePool("respawn"),
    };
  }

  private playCombatEffect(kind: Exclude<CombatEffectKind, "shield">, x: number, y: number, color: number): void {
    const pool = this.effectPools?.[kind];
    if (!pool) return;
    const effect = pool.acquire((item) => item.setPosition(x, y).setVisible(true));
    const configs: Record<Exclude<CombatEffectKind, "shield">, { radius: number; fill: number; stroke: number; duration: number; scale: number }> = {
      muzzle: { radius: 13, fill: 0.78, stroke: 2, duration: 95, scale: 1.8 },
      trail: { radius: 7, fill: 0.42, stroke: 0, duration: 190, scale: 2.3 },
      impact: { radius: 15, fill: 0.2, stroke: 7, duration: 230, scale: 4.2 },
      spark: { radius: 4, fill: 0.82, stroke: 0, duration: 180, scale: 0.25 },
      hit: { radius: PLAYER_RADIUS + 13, fill: 0.16, stroke: 5, duration: 210, scale: 1.55 },
      dash: { radius: PLAYER_RADIUS + 7, fill: 0.1, stroke: 4, duration: 220, scale: 1.75 },
      heal: { radius: PLAYER_RADIUS + 10, fill: 0.12, stroke: 4, duration: 320, scale: 1.65 },
      respawn: { radius: PLAYER_RADIUS + 18, fill: 0.1, stroke: 6, duration: 430, scale: 2.05 },
    };
    const config = configs[kind];
    effect.setRadius(config.radius).setFillStyle(color, config.fill).setStrokeStyle(config.stroke, color, 0.9);
    this.tweens.add({ targets: effect, scale: config.scale, alpha: 0, duration: config.duration, ease: "Cubic.Out", onComplete: () => effect.setVisible(false) });
  }

  private playProjectileImpact(view: MovingView): void {
    const x = view.container.x;
    const y = view.container.y;
    this.playCombatEffect("impact", x, y, view.color);
    if (view.ownerId === this.localPlayerId) this.audio.playImpact();
    if (!shouldRenderEffect("spark", false)) return;
    const pool = this.effectPools?.spark;
    if (!pool) return;
    for (let index = 0; index < 3; index += 1) {
      const angle = (Math.PI * 2 * index) / 5;
      const spark = pool.acquire((item) => item
        .setPosition(x, y)
        .setRadius(4)
        .setFillStyle(view.color, 0.82)
        .setStrokeStyle(0, view.color, 0)
        .setVisible(true));
      const distance = 24 + index * 5;
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        scale: 0.25,
        alpha: 0,
        duration: 180,
        ease: "Cubic.Out",
        onComplete: () => spark.setVisible(false),
      });
    }
    for (let index = 0; index < 2; index += 1) {
      this.playProjectileImageEffect("spark", x, y, view.color, (Math.PI * 2 * index) / 2);
    }
    this.playProjectileImageEffect("smoke", x, y, view.color);
  }

  private syncShield(view: PlayerView, player: PlayerSnapshot, serverTime: number): void {
    const active = player.alive && (player.shieldUntil > serverTime || (player.skillShieldHealth > 0 && player.skillShieldUntil > serverTime));
    if (!active) {
      view.shield?.setVisible(false);
      view.shield = null;
      return;
    }
    if (!view.shield) {
      const shield = this.effectPools?.shield.acquire((effect) => {
        for (const candidate of this.playerViews.values()) if (candidate.shield === effect) candidate.shield = null;
        effect.setRadius(PLAYER_RADIUS + 13).setFillStyle(0x31d0aa, 0.09).setStrokeStyle(5, 0x8fffe6, 0.95).setVisible(true).setAlpha(1);
      });
      view.shield = shield ?? null;
    }
    view.shield?.setVisible(true).setPosition(view.container.x, view.container.y);
  }

  private updatePlayerVisual(view: PlayerView, player: PlayerSnapshot, now: number): void {
    const state = deriveCharacterVisualState({
      alive: player.alive,
      speed: Math.hypot(player.vx, player.vy),
      attackUntil: view.attackUntil,
      hitUntil: view.hitUntil,
    }, now);
    const direction = characterDirectionFromAngle(player.angle);
    if (state !== view.visualState || direction !== view.direction) {
      view.visualState = state;
      view.direction = direction;
      view.sprite.setTexture(resolveCharacterDirectionTextureKey(
        player.characterId,
        direction,
        state,
        this.failedTextureKeys,
      ));
    }
    const moving = state === "move";
    view.sprite.setScale((104 / Math.max(view.sprite.width, view.sprite.height)) * (moving ? 1.035 : 1));
    view.ring.setScale(moving ? 1.08 : 1).setAlpha(player.alive ? (state === "attack" ? 0.95 : 0.68) : 0.18);
    if (state === "hit") view.sprite.setTint(0xffb6b8);
    else if (state === "attack") view.sprite.setTint(0xffedb0);
    else view.sprite.setTint(player.id === this.localPlayerId ? 0xffffff : 0xe8f2f7);
    view.weapon.setAlpha(player.alive ? (state === "attack" ? 1 : 0.92) : 0.34);
    view.shadow.setAlpha(player.alive ? 0.34 : 0.12);
  }

  private resizeCamera(width: number, height: number): void {
    this.cameras.main.setViewport(0, 0, width, height);
    this.cameras.main.setZoom(calculateArenaCameraZoom(height, VIEW_HEIGHT));
    this.updateCamera();
  }

  private updateCamera(): void {
    if (!this.snapshot || this.snapshot.phase === "finished" || !this.localPlayerId) return;
    const local = this.snapshot.players.find((player) => player.id === this.localPlayerId);
    const target = local?.alive
      ? local
      : this.snapshot.players.find((player) => player.alive && player.teamId != null && player.teamId === local?.teamId)
        ?? this.snapshot.players.find((player) => player.alive);
    const view = target ? this.playerViews.get(target.id) : undefined;
    if (!view) return;
    const camera = this.cameras.main;
    const zoom = Math.max(0.01, camera.zoom);
    const viewportWidth = camera.width / zoom;
    const viewportHeight = camera.height / zoom;
    const next = resolveCameraView(
      { x: view.container.x, y: view.container.y },
      { width: viewportWidth, height: viewportHeight },
      { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    );
    camera.setBounds(next.bounds.x, next.bounds.y, next.bounds.width, next.bounds.height);
    camera.centerOn(next.center.x, next.center.y);
  }
}
