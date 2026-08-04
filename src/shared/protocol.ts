export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect extends Vec2 {
  width: number;
  height: number;
}

export type GamePhase = "lobby" | "playing" | "overtime" | "finished";

export interface PlayerInput {
  seq: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  firing: boolean;
}

export interface PlayerSnapshot extends Vec2 {
  id: string;
  nickname: string;
  color: string;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  vx: number;
  vy: number;
  angle: number;
  health: number;
  maxHealth: number;
  score: number;
  kills: number;
  energyCollected: number;
  alive: boolean;
  respawnAt: number | null;
  shieldUntil: number;
  lastProcessedInput: number;
}

export interface ProjectileSnapshot extends Vec2 {
  id: string;
  ownerId: string;
  vx: number;
  vy: number;
}

export interface EnergySnapshot extends Vec2 {
  id: string;
}

export interface RoomSnapshot {
  phase: GamePhase;
  canStart: boolean;
  players: Array<Pick<PlayerSnapshot, "id" | "nickname" | "color" | "isBot" | "connected" | "ready" | "score">>;
}

export interface GameSnapshot {
  serverTime: number;
  phase: GamePhase;
  remainingMs: number;
  overtimePlayerIds: string[];
  winnerIds: string[];
  holderId: string | null;
  holdRemainingMs: number | null;
  finishedAt: number | null;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
  energy: EnergySnapshot[];
}

export interface JoinPayload {
  nickname: string;
  color: string;
}

export interface ReconnectPayload {
  token: string;
}

export interface Ack<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface JoinResult {
  playerId: string;
  reconnectToken: string;
}

export type HostCommand = "start" | "end" | "reset";

export interface ClientToServerEvents {
  join: (payload: JoinPayload, acknowledge: (result: Ack<JoinResult>) => void) => void;
  reconnectPlayer: (payload: ReconnectPayload, acknowledge: (result: Ack<JoinResult>) => void) => void;
  setReady: (ready: boolean, acknowledge: (result: Ack) => void) => void;
  playerInput: (input: PlayerInput) => void;
  hostCommand: (payload: { token: string; command: HostCommand }, acknowledge: (result: Ack) => void) => void;
}

export interface ServerToClientEvents {
  roomState: (snapshot: RoomSnapshot) => void;
  gameState: (snapshot: GameSnapshot) => void;
  notice: (message: string) => void;
}

export interface ServerInfo {
  name: string;
  version: string;
  joinUrls: string[];
  qrDataUrls: string[];
  room: RoomSnapshot;
}
