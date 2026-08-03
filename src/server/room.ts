import { randomUUID } from "node:crypto";

import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  RECONNECT_WINDOW_MS,
} from "../shared/constants";
import type {
  Ack,
  GameSnapshot,
  JoinPayload,
  JoinResult,
  PlayerInput,
  RoomSnapshot,
} from "../shared/protocol";
import { chooseBotInput } from "./bot";
import {
  applyPlayerInput,
  createGameWorld,
  stepWorld,
  worldToSnapshot,
  type GameWorld,
  type PlayerSeed,
} from "./simulation";

interface RoomSeat extends PlayerSeed {
  socketId: string | null;
  reconnectToken: string | null;
  connected: boolean;
  ready: boolean;
  disconnectedAt: number | null;
}

const BOT_NAMES = ["脉冲", "闪光", "电弧", "磁暴", "回声", "星火"];

export class GameRoom {
  private readonly seats = new Map<string, RoomSeat>();
  private readonly socketPlayers = new Map<string, string>();
  private readonly nextBotThinkAt = new Map<string, number>();
  private world: GameWorld | null = null;
  private clockMs = 0;
  private nextPlayerNumber = 1;

  joinHuman(socketId: string, payload: JoinPayload): Ack<JoinResult> {
    if (this.world) return { ok: false, error: "对局已经开始，请等待下一局" };
    if (this.socketPlayers.has(socketId)) return { ok: false, error: "当前设备已经加入" };
    if (this.seats.size >= MAX_PLAYERS) return { ok: false, error: "房间已满" };

    const nickname = sanitizeNickname(payload.nickname);
    if (!nickname) return { ok: false, error: "请输入昵称" };
    if ([...this.seats.values()].some((seat) => seat.nickname === nickname)) {
      return { ok: false, error: "昵称已被使用" };
    }
    if (!PLAYER_COLORS.includes(payload.color as (typeof PLAYER_COLORS)[number])) {
      return { ok: false, error: "请选择有效颜色" };
    }
    if ([...this.seats.values()].some((seat) => seat.color === payload.color)) {
      return { ok: false, error: "这个颜色已被使用" };
    }

    const id = `player-${this.nextPlayerNumber++}`;
    const reconnectToken = randomUUID();
    this.seats.set(id, {
      id,
      nickname,
      color: payload.color,
      isBot: false,
      socketId,
      reconnectToken,
      connected: true,
      ready: false,
      disconnectedAt: null,
    });
    this.socketPlayers.set(socketId, id);
    return { ok: true, data: { playerId: id, reconnectToken } };
  }

  reconnectHuman(socketId: string, token: string): Ack<JoinResult> {
    const seat = [...this.seats.values()].find(
      (candidate) =>
        candidate.reconnectToken === token &&
        candidate.disconnectedAt !== null &&
        this.clockMs - candidate.disconnectedAt <= RECONNECT_WINDOW_MS,
    );
    if (!seat || !seat.reconnectToken) return { ok: false, error: "重连凭证已失效" };

    if (seat.socketId) this.socketPlayers.delete(seat.socketId);
    seat.socketId = socketId;
    seat.connected = true;
    seat.disconnectedAt = null;
    this.socketPlayers.set(socketId, seat.id);
    const player = this.world?.players.get(seat.id);
    if (player) {
      player.connected = true;
      player.isBot = false;
    }
    return { ok: true, data: { playerId: seat.id, reconnectToken: seat.reconnectToken } };
  }

  setReady(socketId: string, ready: boolean): Ack {
    if (this.world) return { ok: false, error: "对局中无法修改准备状态" };
    const seat = this.seatForSocket(socketId);
    if (!seat?.connected || seat.isBot) return { ok: false, error: "尚未加入房间" };
    seat.ready = ready === true;
    return { ok: true };
  }

  startMatch(): Ack {
    if (this.world) return { ok: false, error: "对局已经开始" };
    if (!this.canStart()) return { ok: false, error: "至少需要一名已准备的真人玩家" };

    this.removeDisconnectedLobbySeats();
    this.fillBotSeats();
    this.world = createGameWorld([...this.seats.values()], this.clockMs);
    for (const seat of this.seats.values()) {
      const player = this.world.players.get(seat.id);
      if (!player) continue;
      player.connected = seat.connected;
      player.ready = seat.ready || seat.isBot;
    }
    return { ok: true };
  }

  endMatch(): Ack {
    if (!this.world) return { ok: false, error: "当前没有进行中的对局" };
    this.world.phase = "finished";
    this.world.winnerIds = [];
    this.world.projectiles.clear();
    return { ok: true };
  }

  resetToLobby(): Ack {
    this.world = null;
    this.nextBotThinkAt.clear();
    for (const [id, seat] of this.seats) {
      if (seat.isBot || !seat.connected) {
        this.seats.delete(id);
      } else {
        seat.ready = false;
      }
    }
    return { ok: true };
  }

  disconnect(socketId: string): void {
    const playerId = this.socketPlayers.get(socketId);
    if (!playerId) return;
    this.socketPlayers.delete(socketId);
    const seat = this.seats.get(playerId);
    if (!seat) return;
    seat.socketId = null;
    seat.connected = false;
    seat.ready = false;
    seat.disconnectedAt = this.clockMs;

    const player = this.world?.players.get(playerId);
    if (player) {
      player.connected = false;
      player.isBot = true;
    }
  }

  handleInput(socketId: string, input: PlayerInput): boolean {
    const seat = this.seatForSocket(socketId);
    if (!seat || !seat.connected || seat.isBot || !this.world) return false;
    return applyPlayerInput(this.world, seat.id, input);
  }

  tick(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.clockMs += deltaMs;
    this.expireReconnectTokens();
    if (!this.world || this.world.phase === "finished") return;

    for (const player of this.world.players.values()) {
      if (!player.isBot || this.clockMs < (this.nextBotThinkAt.get(player.id) ?? 0)) continue;
      applyPlayerInput(this.world, player.id, chooseBotInput(this.world, player.id));
      this.nextBotThinkAt.set(player.id, this.clockMs + 180 + Math.random() * 120);
    }
    stepWorld(this.world, deltaMs);
  }

  snapshot(): RoomSnapshot {
    const players = this.world
      ? worldToSnapshot(this.world).players
      : [...this.seats.values()].map((seat) => ({
          id: seat.id,
          nickname: seat.nickname,
          color: seat.color,
          isBot: seat.isBot,
          connected: seat.connected,
          ready: seat.ready,
          score: 0,
        }));
    return {
      phase: this.world?.phase ?? "lobby",
      canStart: this.canStart(),
      players: players.map(({ id, nickname, color, isBot, connected, ready, score }) => ({
        id,
        nickname,
        color,
        isBot,
        connected,
        ready,
        score,
      })),
    };
  }

  gameSnapshot(): GameSnapshot | null {
    return this.world ? worldToSnapshot(this.world) : null;
  }

  playerIdForSocket(socketId: string): string | undefined {
    return this.socketPlayers.get(socketId);
  }

  private canStart(): boolean {
    if (this.world) return false;
    const humans = [...this.seats.values()].filter((seat) => !seat.isBot && seat.connected);
    return humans.length > 0 && humans.every((seat) => seat.ready);
  }

  private seatForSocket(socketId: string): RoomSeat | undefined {
    const id = this.socketPlayers.get(socketId);
    return id ? this.seats.get(id) : undefined;
  }

  private fillBotSeats(): void {
    while (this.seats.size < MAX_PLAYERS) {
      const index = this.seats.size;
      const id = `bot-${this.nextPlayerNumber++}`;
      this.seats.set(id, {
        id,
        nickname: BOT_NAMES[index % BOT_NAMES.length] ?? `机器人 ${index + 1}`,
        color: PLAYER_COLORS.find((color) => ![...this.seats.values()].some((seat) => seat.color === color)) ?? "#ffffff",
        isBot: true,
        socketId: null,
        reconnectToken: null,
        connected: false,
        ready: true,
        disconnectedAt: null,
      });
    }
  }

  private removeDisconnectedLobbySeats(): void {
    for (const [id, seat] of this.seats) {
      if (!seat.connected) this.seats.delete(id);
    }
  }

  private expireReconnectTokens(): void {
    for (const seat of this.seats.values()) {
      if (seat.disconnectedAt === null || this.clockMs - seat.disconnectedAt <= RECONNECT_WINDOW_MS) continue;
      seat.reconnectToken = null;
      seat.isBot = true;
      const player = this.world?.players.get(seat.id);
      if (player) player.isBot = true;
    }
  }
}

function sanitizeNickname(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 12);
}
