import { io, type Socket } from "socket.io-client";

import { CHARACTER_CATALOG, type CharacterId } from "../shared/character-catalog";
import type { TacticalModuleId } from "../shared/tactical-module-catalog";
import type {
  ClientDiagnosticSample,
  DeviceDiagnosticProfile,
  DiagnosticReport,
  HostDiagnosticsSnapshot,
} from "../shared/diagnostics";
import type {
  Ack,
  ClientToServerEvents,
  GameSnapshot,
  GamePhase,
  HostCommand,
  HostAdminCommand,
  JoinPayload,
  JoinResult,
  PerformanceHint,
  PlayerInput,
  RoomSnapshot,
  ServerToClientEvents,
  TeamSignalEvent,
  TeamSignalKind,
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

export function shouldRequireCharacterReselection(
  previousPhase: GamePhase | null,
  nextPhase: GamePhase,
  hasSeat: boolean,
): boolean {
  return hasSeat && previousPhase !== null && previousPhase !== "lobby" && nextPhase === "lobby";
}

export function canReadyAfterCharacterSelection(hasSelectedCharacter: boolean, currentlyReady: boolean): boolean {
  return currentlyReady || hasSelectedCharacter;
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
  diagnosticsMatchId: string | null = null;
  hostDiagnostics: HostDiagnosticsSnapshot | null = null;
  latestDiagnosticReport: DiagnosticReport | null = null;
  playerId: string | null = localStorage.getItem(PLAYER_KEY);
  notice = "";
  latestTeamSignal: TeamSignalEvent | null = null;
  private readonly listeners = new Set<NetworkListener>();
  private diagnosticsProfileSent = false;
  private connectionGeneration = 0;

  get connectionVersion(): number {
    return this.connectionGeneration;
  }

  constructor(autoReconnectPlayer = true) {
    this.socket = io({ transports: ["websocket", "polling"] });
    this.socket.on("connect", () => {
      this.connectionGeneration += 1;
      this.connected = true;
      this.playerSessionReady = false;
      this.snapshotMode = "full";
      this.diagnosticsProfileSent = false;
      this.notice = "";
      this.notify();
      if (autoReconnectPlayer) void this.tryReconnect();
    });
    this.socket.on("disconnect", () => {
      this.connectionGeneration += 1;
      this.connected = false;
      this.playerSessionReady = false;
      this.hostDiagnostics = null;
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
    this.socket.on("teamSignal", (event) => {
      this.latestTeamSignal = event;
      this.notify();
    });
    this.socket.on("diagnosticsSession", ({ matchId }) => {
      this.diagnosticsMatchId = matchId;
      this.notify();
    });
    this.socket.on("hostDiagnostics", (snapshot) => {
      this.hostDiagnostics = snapshot;
      this.notify();
    });
    this.socket.on("diagnosticReport", (report) => {
      this.latestDiagnosticReport = report;
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

  async changeTacticalModule(tacticalModuleId: TacticalModuleId): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit("changeTacticalModule", tacticalModuleId, resolve));
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

  sendTeamSignal(kind: TeamSignalKind): void {
    if (this.connected && this.playerSessionReady) this.socket.emit("teamSignal", { kind });
  }

  sendPerformanceHint(hint: PerformanceHint): void {
    if (!this.connected) return;
    this.snapshotMode = hint.snapshotMode;
    this.socket.emit("performanceHint", hint);
    this.notify();
  }

  sendDiagnosticsProfile(profile: DeviceDiagnosticProfile): void {
    if (!this.connected || this.diagnosticsProfileSent) return;
    this.socket.emit("diagnosticsProfile", profile);
    this.diagnosticsProfileSent = true;
  }

  sendDiagnosticsSample(sample: ClientDiagnosticSample): void {
    if (!this.connected) return;
    this.socket.volatile.emit("diagnosticsSample", sample);
  }

  measureDiagnosticsRtt(
    now: () => number = performance.now.bind(performance),
    timeoutMs = 750,
  ): Promise<number | null> {
    if (!this.connected) return Promise.resolve(null);
    const sentAt = now();
    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(null);
      }, timeoutMs);
      this.socket.emit("diagnosticsPing", sentAt, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(Math.max(0, now() - sentAt));
      });
    });
  }

  async subscribeHostDiagnostics(token: string): Promise<Ack> {
    const generation = this.connectionGeneration;
    const result = await new Promise<Ack>((resolve) => this.socket.emit("subscribeHostDiagnostics", { token }, resolve));
    if (!this.connected || generation !== this.connectionGeneration) return { ok: false, error: "连接已更新，请重新订阅" };
    return result;
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
