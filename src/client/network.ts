import { io, type Socket } from "socket.io-client";

import { CHARACTER_CATALOG, type CharacterId } from "../shared/character-catalog";
import type {
  Ack,
  ClientToServerEvents,
  GameSnapshot,
  HostCommand,
  HostAdminCommand,
  JoinPayload,
  JoinResult,
  PerformanceHint,
  PlayerInput,
  RoomSnapshot,
  ServerToClientEvents,
} from "../shared/protocol";

export type CharacterSelectionCard = (typeof CHARACTER_CATALOG)[number] & {
  selected: boolean;
  unavailable: boolean;
};

export function buildCharacterSelection(
  room: RoomSnapshot | null,
  ownPlayerId: string | null,
  selectedCharacterId: CharacterId,
): CharacterSelectionCard[] {
  const occupiedByOtherHumans = new Set(
    (room?.players ?? [])
      .filter((player) => !player.isBot && player.id !== ownPlayerId)
      .map((player) => player.characterId),
  );
  return CHARACTER_CATALOG.map((character) => ({
    ...character,
    selected: character.id === selectedCharacterId,
    unavailable: occupiedByOtherHumans.has(character.id),
  }));
}

export function isCharacterSelectionDisabled(
  unavailable: boolean,
  ownSeat: Pick<RoomSnapshot["players"][number], "characterId" | "ready"> | undefined,
  characterId: CharacterId,
): boolean {
  return unavailable || Boolean(ownSeat?.ready && ownSeat.characterId !== characterId);
}

const TOKEN_KEY = "energy-brawl.reconnect-token";
const PLAYER_KEY = "energy-brawl.player-id";

export type NetworkListener = () => void;

export class GameNetworkClient {
  readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  connected = false;
  playerSessionReady = false;
  snapshotMode: PerformanceHint["snapshotMode"] = "full";
  room: RoomSnapshot | null = null;
  game: GameSnapshot | null = null;
  playerId: string | null = localStorage.getItem(PLAYER_KEY);
  notice = "";
  private readonly listeners = new Set<NetworkListener>();

  constructor(autoReconnectPlayer = true) {
    this.socket = io({ transports: ["websocket", "polling"] });
    this.socket.on("connect", () => {
      this.connected = true;
      this.playerSessionReady = false;
      this.snapshotMode = "full";
      this.notice = "";
      this.notify();
      if (autoReconnectPlayer) void this.tryReconnect();
    });
    this.socket.on("disconnect", () => {
      this.connected = false;
      this.playerSessionReady = false;
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

  async changeCharacter(characterId: CharacterId): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit("changeCharacter", characterId, resolve));
  }

  async returnToLobby(): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit("returnToLobby", resolve));
  }

  sendInput(input: PlayerInput): void {
    if (this.connected && this.playerSessionReady) this.socket.emit("playerInput", input);
  }

  sendSkillAction(skillActionSeq: number): void {
    if (this.connected && this.playerSessionReady) this.socket.emit("useSkill", { skillActionSeq });
  }

  sendExclusiveSkillAction(skillActionSeq: number, directionX: number, directionY: number): void {
    if (this.connected && this.playerSessionReady) this.socket.emit("useExclusiveSkill", { skillActionSeq, directionX, directionY });
  }

  sendPerformanceHint(hint: PerformanceHint): void {
    if (!this.connected) return;
    this.snapshotMode = hint.snapshotMode;
    this.socket.emit("performanceHint", hint);
    this.notify();
  }

  async hostCommand(token: string, command: HostCommand): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit("hostCommand", { token, command }, resolve));
  }

  async hostAdminCommand(token: string, command: HostAdminCommand): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit("hostAdminCommand", { token, command }, resolve));
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
      this.playerSessionReady = false;
    }
    this.notify();
  }

  private storeIdentity(result: JoinResult): void {
    this.playerId = result.playerId;
    this.playerSessionReady = true;
    localStorage.setItem(TOKEN_KEY, result.reconnectToken);
    localStorage.setItem(PLAYER_KEY, result.playerId);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
