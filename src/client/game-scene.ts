import Phaser from "phaser";

import { ARENA_HEIGHT, ARENA_WIDTH, PLAYER_RADIUS, WALLS } from "../shared/constants";
import type { GameSnapshot, PlayerInput, PlayerSnapshot, Vec2 } from "../shared/protocol";
import { consumePositionCorrection, InputReconciler } from "./input-reconciliation";
import { predictLocalPosition } from "./prediction";
import { shouldAdvanceSnapshotAnchor, SnapshotBuffer } from "./snapshot-buffer";

interface PlayerView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  aim: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  healthFill: Phaser.GameObjects.Rectangle;
  shield: Phaser.GameObjects.Arc;
  lastHealth: number;
}

interface MovingView {
  object: Phaser.GameObjects.Arc;
}

export class GameRenderer {
  private readonly scene: ArenaScene;
  private readonly game: Phaser.Game;

  constructor(container: HTMLElement, localPlayerId: string | null) {
    this.scene = new ArenaScene(localPlayerId);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
      backgroundColor: "#101419",
      scene: this.scene,
      transparent: false,
      antialias: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        roundPixels: true,
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
  private latestSnapshotReceivedAt = 0;
  private renderDelayMs = 100;
  private correctionRemaining: Vec2 = { x: 0, y: 0 };
  private ready = false;

  constructor(private localPlayerId: string | null) {
    super({ key: "arena" });
  }

  preload(): void {
    this.load.svg("energy-core", "/assets/energy-core.svg", { width: 96, height: 96 });
    this.load.svg("arena-sigil", "/assets/arena-sigil.svg", { width: 240, height: 240 });
  }

  create(): void {
    this.drawArena();
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
      if (id === this.localPlayerId && this.localPlayerCanMove()) {
        const predicted = predictLocalPosition(view.container, this.localInput, delta);
        view.container.setPosition(predicted.x, predicted.y);
        this.consumeCorrection(view.container, delta);
        continue;
      }
      if (id === this.localPlayerId) this.consumeCorrection(view.container, delta);
    }
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

  addLocalInput(input: PlayerInput, deltaMs: number): void {
    this.inputReconciler.add(input, deltaMs);
  }

  setSnapshotMode(mode: "full" | "reduced"): void {
    this.renderDelayMs = mode === "reduced" ? 150 : 100;
  }

  resetLocalInputs(): void {
    this.inputReconciler.reset();
    this.localInput = { x: 0, y: 0 };
    this.correctionRemaining = { x: 0, y: 0 };
  }

  private localPlayerCanMove(): boolean {
    if (!this.snapshot || (this.snapshot.phase !== "playing" && this.snapshot.phase !== "overtime")) return false;
    return this.snapshot.players.find((player) => player.id === this.localPlayerId)?.alive === true;
  }

  private drawArena(): void {
    this.add.rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x101419);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0xffffff, 0.045);
    for (let x = 0; x <= ARENA_WIDTH; x += 80) grid.lineBetween(x, 0, x, ARENA_HEIGHT);
    for (let y = 0; y <= ARENA_HEIGHT; y += 80) grid.lineBetween(0, y, ARENA_WIDTH, y);

    const lanes = this.add.graphics();
    lanes.lineStyle(4, 0xf2c14e, 0.18);
    lanes.strokeCircle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 178);
    lanes.lineStyle(3, 0x31d0aa, 0.14);
    lanes.strokeRoundedRect(110, 90, ARENA_WIDTH - 220, ARENA_HEIGHT - 180, 70);

    this.add.image(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, "arena-sigil").setAlpha(0.15).setScale(1.35);
    for (const wall of WALLS) {
      this.add.rectangle(wall.x + wall.width / 2 + 7, wall.y + wall.height / 2 + 8, wall.width, wall.height, 0x000000, 0.28);
      this.add
        .rectangle(wall.x + wall.width / 2, wall.y + wall.height / 2, wall.width, wall.height, 0x293139)
        .setStrokeStyle(4, 0x65747d, 0.8);
    }
    this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH - 10, ARENA_HEIGHT - 10)
      .setStrokeStyle(10, 0x050708, 1)
      .setFillStyle(0x000000, 0);
  }

  private syncSnapshot(snapshot: GameSnapshot): void {
    const activePlayers = new Set(snapshot.players.map((player) => player.id));
    for (const [id, view] of this.playerViews) {
      if (!activePlayers.has(id)) {
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
      }
      view.aim.rotation = player.angle;
      view.container.setAlpha(player.alive ? 1 : 0.18);
      view.name.setText(player.isBot ? `${player.nickname} · AI` : player.nickname);
      view.healthFill.width = 58 * (player.health / player.maxHealth);
      view.healthFill.setFillStyle(player.health <= 25 ? 0xff5a5f : 0x31d0aa);
      view.shield.setVisible(player.shieldUntil > snapshot.serverTime && player.alive);
      view.body.setStrokeStyle(player.id === this.localPlayerId ? 8 : 4, player.id === this.localPlayerId ? 0xffffff : 0x111820, 1);
      if (player.health < view.lastHealth && player.alive) this.playHitFeedback(view);
      view.lastHealth = player.health;
    }

    this.syncEnergy(snapshot);
  }

  private createPlayerView(player: PlayerSnapshot): PlayerView {
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const shadow = this.add.circle(5, 7, PLAYER_RADIUS + 4, 0x000000, 0.3);
    const body = this.add.circle(0, 0, PLAYER_RADIUS, color, 1);
    const core = this.add.circle(-6, -8, 8, 0xffffff, 0.68);
    const aim = this.add.rectangle(PLAYER_RADIUS + 15, 0, 32, 10, 0xffffff, 0.95).setOrigin(0, 0.5);
    const shield = this.add.circle(0, 0, PLAYER_RADIUS + 11, 0x31d0aa, 0.08).setStrokeStyle(4, 0x8fffe6, 0.9);
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
    const container = this.add.container(player.x, player.y, [shadow, aim, body, core, shield, healthBg, healthFill, name]);
    const view: PlayerView = {
      container,
      body,
      aim,
      name,
      healthFill,
      shield,
      lastHealth: player.health,
    };
    this.playerViews.set(player.id, view);
    return view;
  }

  private playHitFeedback(view: PlayerView): void {
    this.tweens.add({
      targets: view.body,
      alpha: 0.25,
      yoyo: true,
      duration: 75,
      repeat: 1,
    });
    if (view.container.list.some((child) => child === view.body) && view.container.x && view.container.y) {
      const flash = this.add.circle(view.container.x, view.container.y, PLAYER_RADIUS + 12, 0xff5a5f, 0.35);
      this.tweens.add({ targets: flash, scale: 1.5, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
    }
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
}
