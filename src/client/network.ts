import { io, type Socket } from "socket.io-client";

import type {
  Ack,
  ClientToServerEvents,
  GameSnapshot,
  HostCommand,
  JoinPayload,
  JoinResult,
  PlayerInput,
  RoomSnapshot,
  ServerToClientEvents,
} from "../shared/protocol";

const TOKEN_KEY = "energy-brawl.reconnect-token";
const PLAYER_KEY = "energy-brawl.player-id";

export type NetworkListener = () => void;

export class GameNetworkClient {
  readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  connected = false;
  room: RoomSnapshot | null = null;
  game: GameSnapshot | null = null;
  playerId: string | null = localStorage.getItem(PLAYER_KEY);
  notice = "";
  private readonly listeners = new Set<NetworkListener>();

  constructor(autoReconnectPlayer = true) {
    this.socket = io({ transports: ["websocket", "polling"] });
    this.socket.on("connect", () => {
      this.connected = true;
      this.notice = "";
      this.notify();
      if (autoReconnectPlayer) void this.tryReconnect();
    });
    this.socket.on("disconnect", () => {
      this.connected = false;
      this.notify();
    });
    this.socket.on("roomState", (room) => {
      this.room = room;
      if (room.phase === "lobby") this.game = null;
      this.notify();
    });
    this.socket.on("gameState", (game) => {
      this.game = game;
      this.notify();
    });
    this.socket.on("notice", (message) => {
      this.notice = message;
      this.notify();
    });
  }

  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    listener();
    return () => this.listeners.delete(listener);
  }

  async join(payload: JoinPayload): Promise<Ack<JoinResult>> {
    const result = await new Promise<Ack<JoinResult>>((resolve) => this.socket.emit("join", payload, resolve));
    if (result.ok && result.data) this.storeIdentity(result.data);
    return result;
  }

  async setReady(ready: boolean): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit("setReady", ready, resolve));
  }

  sendInput(input: PlayerInput): void {
    if (this.connected) this.socket.emit("playerInput", input);
  }

  async hostCommand(token: string, command: HostCommand): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit("hostCommand", { token, command }, resolve));
  }

  dispose(): void {
    this.listeners.clear();
    this.socket.disconnect();
  }

  private async tryReconnect(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const result = await new Promise<Ack<JoinResult>>((resolve) =>
      this.socket.emit("reconnectPlayer", { token }, resolve),
    );
    if (result.ok && result.data) {
      this.storeIdentity(result.data);
    } else if (this.room?.phase === "lobby") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PLAYER_KEY);
      this.playerId = null;
    }
    this.notify();
  }

  private storeIdentity(result: JoinResult): void {
    this.playerId = result.playerId;
    localStorage.setItem(TOKEN_KEY, result.reconnectToken);
    localStorage.setItem(PLAYER_KEY, result.playerId);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
