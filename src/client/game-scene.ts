import Phaser from "phaser";

import { CHARACTER_CATALOG } from "../shared/character-catalog";
import { ARENA_HEIGHT, ARENA_WIDTH, PLAYER_RADIUS, PROJECTILE_LIFETIME_MS, VIEW_HEIGHT, VIEW_WIDTH, WALLS } from "../shared/constants";
import type { GameSnapshot, PlayerInput, PlayerSnapshot, Vec2 } from "../shared/protocol";
import { calculateAimGuide } from "./aim-guide";
import { ARENA_ASSETS, CHARACTER_ASSETS, type CharacterAssetState } from "./asset-registry";
import {
  FixedObjectPool,
  characterTextureKey,
  deriveCharacterVisualState,
  resolveCharacterTextureKey,
  type CombatEffectKind,
  type CharacterVisualState,
} from "./effect-pool";
import { consumePositionCorrection, InputReconciler } from "./input-reconciliation";
import { calculateArenaCameraZoom } from "./mobile-viewport";
import { predictLocalPosition } from "./prediction";
import { shouldAdvanceSnapshotAnchor, SnapshotBuffer } from "./snapshot-buffer";

interface PlayerView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  aim: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  healthFill: Phaser.GameObjects.Rectangle;
  shadow: Phaser.GameObjects.Ellipse;
  shield: Phaser.GameObjects.Arc | null;
  lastHealth: number;
  wasAlive: boolean;
  attackUntil: number;
  hitUntil: number;
  lastDashEffectAt: number;
  visualState: CharacterVisualState;
}

interface MovingView {
  object: Phaser.GameObjects.Arc;
}

const CHARACTER_RENDER_STATES: readonly CharacterAssetState[] = ["idle", "move", "attack", "hit", "death", "fallback"];
const EFFECT_CAPACITY: Readonly<Record<CombatEffectKind, number>> = {
  muzzle: 18,
  trail: 48,
  hit: 18,
  shield: 6,
  dash: 12,
  heal: 10,
  respawn: 8,
};

export class GameRenderer {
  private readonly scene: ArenaScene;
  private readonly game: Phaser.Game;

  constructor(container: HTMLElement, localPlayerId: string | null) {
    this.scene = new ArenaScene(localPlayerId);
    const width = Math.max(1, container.clientWidth || VIEW_WIDTH);
    const height = Math.max(1, container.clientHeight || VIEW_HEIGHT);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width,
      height,
      backgroundColor: "#101419",
      scene: this.scene,
      transparent: false,
      antialias: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width,
        height,
      },
      render: {
        roundPixels: false,
        antialiasGL: true,
      },
    });
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

  setSnapshotMode(mode: "full" | "reduced"): void {
    this.scene.setSnapshotMode(mode);
  }

  resetLocalInputs(): void {
    this.scene.resetLocalInputs();
  }

  destroy(): void {
    this.game.destroy(true);
  }
}

class ArenaScene extends Phaser.Scene {
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly projectileViews = new Map<string, MovingView>();
  private readonly energyViews = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly snapshotBuffer = new SnapshotBuffer<GameSnapshot>();
  private readonly inputReconciler = new InputReconciler();
  private snapshot: GameSnapshot | null = null;
  private localInput: Vec2 = { x: 0, y: 0 };
  private localAim: Vec2 = { x: 0, y: 0 };
  private aimCorridor: Phaser.GameObjects.Rectangle | null = null;
  private aimEnd: Phaser.GameObjects.Arc | null = null;
  private latestSnapshotReceivedAt = 0;
  private renderDelayMs = 100;
  private correctionRemaining: Vec2 = { x: 0, y: 0 };
  private readonly failedTextureKeys = new Set<string>();
  private readonly decorativeLights: Phaser.GameObjects.Image[] = [];
  private readonly decorativeShadows: Phaser.GameObjects.GameObject[] = [];
  private effectPools: Record<CombatEffectKind, FixedObjectPool<Phaser.GameObjects.Arc>> | null = null;
  private lowPerformance = false;
  private ready = false;

  constructor(private localPlayerId: string | null) {
    super({ key: "arena" });
  }

  preload(): void {
    this.load.svg("energy-core", "/assets/energy-core.svg", { width: 96, height: 96 });
    this.load.svg("arena-sigil", "/assets/arena-sigil.svg", { width: 240, height: 240 });
    this.load.image("arena-floor-v3", ARENA_ASSETS.floor);
    this.load.image("arena-wall-v3", ARENA_ASSETS.wall);
    this.load.image("arena-decal-v3", ARENA_ASSETS.decal);
    this.load.image("arena-light-v3", ARENA_ASSETS.light);
    for (const character of CHARACTER_CATALOG) {
      for (const state of CHARACTER_RENDER_STATES) {
        this.load.image(characterTextureKey(character.id, state), CHARACTER_ASSETS[character.id][state]);
      }
    }
    this.load.on("loaderror", (file: Phaser.Loader.File) => this.failedTextureKeys.add(String(file.key)));
  }

  create(): void {
    this.createGeneratedFallbackTextures();
    this.drawArena();
    this.createEffectPools();
    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.resizeCamera(this.scale.width, this.scale.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize: Phaser.Structs.Size) => this.resizeCamera(gameSize.width, gameSize.height));
    this.aimCorridor = this.add.rectangle(0, 0, 1, 64, 0xff5a5f, 0.2).setOrigin(0, 0.5).setDepth(8).setVisible(false);
    this.aimEnd = this.add.circle(0, 0, 18, 0xff5a5f, 0.12).setStrokeStyle(4, 0xffd4d5, 0.8).setDepth(9).setVisible(false);
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
    this.updateAimGuide();
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

  addLocalInput(input: PlayerInput, deltaMs: number): void {
    this.inputReconciler.add(input, deltaMs);
  }

  setSnapshotMode(mode: "full" | "reduced"): void {
    this.renderDelayMs = mode === "reduced" ? 150 : 100;
    this.lowPerformance = mode === "reduced";
    this.applyPerformanceMode();
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
    this.add.tileSprite(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, "arena-floor-v3").setDepth(-10).setTint(0x6d89a0);
    const grid = this.add.graphics();
    grid.setDepth(-8).lineStyle(1, 0xffffff, 0.035);
    for (let x = 0; x <= ARENA_WIDTH; x += 80) grid.lineBetween(x, 0, x, ARENA_HEIGHT);
    for (let y = 0; y <= ARENA_HEIGHT; y += 80) grid.lineBetween(0, y, ARENA_WIDTH, y);

    const lanes = this.add.graphics().setDepth(-7);
    lanes.lineStyle(4, 0xf2c14e, 0.18);
    lanes.strokeCircle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 178);
    lanes.lineStyle(3, 0x31d0aa, 0.14);
    lanes.strokeRoundedRect(110, 90, ARENA_WIDTH - 220, ARENA_HEIGHT - 180, 70);
    lanes.lineStyle(18, 0x4da3ff, 0.08);
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
      this.add.image(x, y, "arena-decal-v3").setDepth(-6).setScale(scale).setAlpha(0.42).setTint(0x8fc9ff);
    }
    this.add.image(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, "arena-sigil").setDepth(-5).setAlpha(0.18).setScale(1.55);
    for (const [x, y] of [[420, 360], [ARENA_WIDTH - 420, 360], [420, ARENA_HEIGHT - 360], [ARENA_WIDTH - 420, ARENA_HEIGHT - 360]] as const) {
      const light = this.add.image(x, y, "arena-light-v3").setDepth(-4).setScale(2.2).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD);
      this.decorativeLights.push(light);
      this.tweens.add({ targets: light, alpha: 0.1, scale: 2.6, duration: 1_800, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
    for (const wall of WALLS) {
      const shadow = this.add.rectangle(wall.x + wall.width / 2 + 9, wall.y + wall.height / 2 + 10, wall.width, wall.height, 0x000000, 0.3).setDepth(-2);
      this.decorativeShadows.push(shadow);
      this.add.tileSprite(wall.x + wall.width / 2, wall.y + wall.height / 2, wall.width, wall.height, "arena-wall-v3")
        .setDepth(-1)
        .setTint(0x71818c);
      this.add.rectangle(wall.x + wall.width / 2, wall.y + wall.height / 2, wall.width, wall.height, 0x000000, 0)
        .setDepth(0)
        .setStrokeStyle(4, 0x9badb8, 0.82);
    }
    this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH - 10, ARENA_HEIGHT - 10)
      .setStrokeStyle(10, 0x050708, 1)
      .setFillStyle(0x000000, 0);
    this.applyPerformanceMode();
  }

  private syncSnapshot(snapshot: GameSnapshot): void {
    const activePlayers = new Set(snapshot.players.map((player) => player.id));
    for (const [id, view] of this.playerViews) {
      if (!activePlayers.has(id)) {
        if (view.shield) view.shield.setVisible(false);
        view.container.destroy(true);
        this.playerViews.delete(id);
      }
    }

    for (const player of snapshot.players) {
      const view = this.playerViews.get(player.id) ?? this.createPlayerView(player);
      if (player.id === this.localPlayerId) {
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
        if (snapshot.phase === "finished") this.cameras.main.stopFollow();
        else this.cameras.main.startFollow(view.container, true, 0.12, 0.12);
      }
      const now = performance.now();
      view.aim.rotation = player.angle;
      view.sprite.setRotation(player.angle + Math.PI / 2);
      view.container.setAlpha(player.alive ? 1 : 0.62);
      view.name.setText(player.isBot ? `${player.nickname} · AI` : player.nickname);
      view.healthFill.width = 58 * (player.health / player.maxHealth);
      view.healthFill.setFillStyle(player.health <= 25 ? 0xff5a5f : 0x31d0aa);
      this.syncShield(view, player, snapshot.serverTime);
      view.sprite.setTint(player.id === this.localPlayerId ? 0xffffff : 0xf2f6f8);
      if (player.health < view.lastHealth && player.alive) {
        view.hitUntil = now + 180;
        this.playCombatEffect("hit", view.container.x, view.container.y, 0xff5a5f);
      } else if (player.health > view.lastHealth && player.alive) {
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
    }

    this.syncEnergy(snapshot);
  }

  private createPlayerView(player: PlayerSnapshot): PlayerView {
    const shadow = this.add.ellipse(4, 11, PLAYER_RADIUS * 2.25, PLAYER_RADIUS * 1.35, 0x000000, 0.34);
    const sprite = this.add.sprite(0, 0, resolveCharacterTextureKey(player.characterId, "idle", this.failedTextureKeys)).setDisplaySize(86, 86);
    const aim = this.add.rectangle(PLAYER_RADIUS + 15, 0, 32, 10, 0xffffff, 0.95).setOrigin(0, 0.5);
    const healthBg = this.add.rectangle(-29, 42, 58, 6, 0x07090b, 0.8).setOrigin(0, 0.5);
    const healthFill = this.add.rectangle(-29, 42, 58, 6, 0x31d0aa, 1).setOrigin(0, 0.5);
    const name = this.add
      .text(0, -47, player.nickname, {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: "18px",
        color: "#ffffff",
        stroke: "#050708",
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const container = this.add.container(player.x, player.y, [shadow, aim, sprite, healthBg, healthFill, name]).setDepth(4);
    const view: PlayerView = {
      container,
      sprite,
      aim,
      name,
      healthFill,
      shadow,
      shield: null,
      lastHealth: player.health,
      wasAlive: player.alive,
      attackUntil: 0,
      hitUntil: 0,
      lastDashEffectAt: 0,
      visualState: "idle",
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

  private syncBufferedProjectiles(older: GameSnapshot, newer: GameSnapshot, alpha: number): void {
    const lifecycleSnapshot = alpha < 1 ? older : newer;
    const active = new Set(lifecycleSnapshot.projectiles.map((projectile) => projectile.id));
    for (const [id, view] of this.projectileViews) {
      if (!active.has(id)) {
        view.object.destroy();
        this.projectileViews.delete(id);
      }
    }
    for (const projectile of lifecycleSnapshot.projectiles) {
      let view = this.projectileViews.get(projectile.id);
      if (!view) {
        const owner = lifecycleSnapshot.players.find((player) => player.id === projectile.ownerId);
        const color = Phaser.Display.Color.HexStringToColor(owner?.color ?? "#ffffff").color;
        const object = this.add.circle(projectile.x, projectile.y, 9, color, 1).setStrokeStyle(3, 0xffffff, 0.75);
        view = { object };
        this.projectileViews.set(projectile.id, view);
        this.playCombatEffect("trail", projectile.x, projectile.y, color);
        if (owner) {
          const ownerView = this.playerViews.get(owner.id);
          if (ownerView) ownerView.attackUntil = performance.now() + 150;
          this.playCombatEffect("muzzle", owner.x + Math.cos(owner.angle) * 50, owner.y + Math.sin(owner.angle) * 50, color);
        }
      }
      const start = older.projectiles.find((candidate) => candidate.id === projectile.id) ?? projectile;
      const end = newer.projectiles.find((candidate) => candidate.id === projectile.id) ?? start;
      view.object.setPosition(
        Phaser.Math.Linear(start.x, end.x, alpha),
        Phaser.Math.Linear(start.y, end.y, alpha),
      );
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

  private updateAimGuide(): void {
    if (!this.aimCorridor || !this.aimEnd || !this.snapshot) return;
    const view = this.localPlayerId ? this.playerViews.get(this.localPlayerId) : null;
    const player = this.snapshot.players.find((candidate) => candidate.id === this.localPlayerId);
    const guide = view && player?.alive && this.snapshot.phase !== "finished"
      ? calculateAimGuide(view.container, this.localAim, player.projectileSpeed * PROJECTILE_LIFETIME_MS / 1_000, WALLS)
      : { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, angle: 0, length: 0, visible: false };
    this.aimCorridor.setVisible(guide.visible).setPosition(guide.start.x, guide.start.y).setRotation(guide.angle).setSize(guide.length, 64).setDisplaySize(guide.length, 64);
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

  private createEffectPools(): void {
    const makePool = (kind: CombatEffectKind): FixedObjectPool<Phaser.GameObjects.Arc> => new FixedObjectPool(
      EFFECT_CAPACITY[kind],
      () => this.add.circle(0, 0, 10, 0xffffff, 0).setDepth(kind === "trail" ? 2 : 7).setVisible(false),
      (effect) => {
        this.tweens.killTweensOf(effect);
        effect.setVisible(false).setAlpha(1).setScale(1).setFillStyle(0xffffff, 0).setStrokeStyle(0, 0xffffff, 0);
      },
    );
    this.effectPools = {
      muzzle: makePool("muzzle"),
      trail: makePool("trail"),
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
      hit: { radius: PLAYER_RADIUS + 13, fill: 0.16, stroke: 5, duration: 210, scale: 1.55 },
      dash: { radius: PLAYER_RADIUS + 7, fill: 0.1, stroke: 4, duration: 220, scale: 1.75 },
      heal: { radius: PLAYER_RADIUS + 10, fill: 0.12, stroke: 4, duration: 320, scale: 1.65 },
      respawn: { radius: PLAYER_RADIUS + 18, fill: 0.1, stroke: 6, duration: 430, scale: 2.05 },
    };
    const config = configs[kind];
    effect.setRadius(config.radius).setFillStyle(color, config.fill).setStrokeStyle(config.stroke, color, 0.9);
    this.tweens.add({ targets: effect, scale: config.scale, alpha: 0, duration: config.duration, ease: "Cubic.Out", onComplete: () => effect.setVisible(false) });
  }

  private syncShield(view: PlayerView, player: PlayerSnapshot, serverTime: number): void {
    const active = player.alive && player.shieldUntil > serverTime;
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
    if (state !== view.visualState) {
      view.visualState = state;
      view.sprite.setTexture(resolveCharacterTextureKey(player.characterId, state, this.failedTextureKeys));
    }
    const moving = state === "move";
    view.sprite.setScale((86 / Math.max(view.sprite.width, view.sprite.height)) * (moving ? 1.025 : 1));
    view.shadow.setAlpha(this.lowPerformance ? 0.16 : player.alive ? 0.34 : 0.12);
  }

  private applyPerformanceMode(): void {
    for (const light of this.decorativeLights) {
      light.setAlpha(this.lowPerformance ? 0.08 : 0.22);
      const tweens = this.tweens.getTweensOf(light);
      for (const tween of tweens) this.lowPerformance ? tween.pause() : tween.resume();
    }
    for (const shadow of this.decorativeShadows) (shadow as Phaser.GameObjects.Rectangle).setAlpha(this.lowPerformance ? 0.14 : 1);
  }

  private resizeCamera(width: number, height: number): void {
    this.cameras.main.setViewport(0, 0, width, height);
    this.cameras.main.setZoom(calculateArenaCameraZoom(height, VIEW_HEIGHT));
  }
}
