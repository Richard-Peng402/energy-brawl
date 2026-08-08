import type { CharacterId } from "./character-catalog";
import type { MatchMode, TeamId } from "./mode-catalog";
import type { SkillType } from "./skill-catalog";

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

export interface PerformanceHint {
  snapshotMode: "full" | "reduced";
  frameP95Ms: number;
}

export interface PlayerSnapshot extends Vec2 {
  id: string;
  nickname: string;
  characterId: CharacterId;
  color: string;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  vx: number;
  vy: number;
  angle: number;
  health: number;
  maxHealth: number;
  damage: number;
  moveSpeed: number;
  fireCooldownMs: number;
  projectileSpeed: number;
  score: number;
  kills: number;
  energyCollected: number;
  alive: boolean;
  respawnAt: number | null;
  shieldUntil: number;
  skillShieldHealth: number;
  skillShieldUntil: number;
  lastProcessedInput: number;
  skillSlot: SkillSlotSnapshot;
  lastProcessedSkillAction: number;
  teamId?: TeamId | null;
  exclusiveSkillCooldownMs?: number;
  exclusiveSkillReadyAt?: number;
}

export type AdminStat =
  | "health" | "maxHealth" | "damage" | "score"
  | "moveSpeed" | "fireCooldownMs" | "projectileSpeed"
  | "kills" | "energyCollected" | "exclusiveSkillCooldownMs";

export type AdminStats = Pick<PlayerSnapshot, AdminStat>;

export interface ProjectileSnapshot extends Vec2 {
  id: string;
  ownerId: string;
  vx: number;
  vy: number;
}

export interface EnergySnapshot extends Vec2 {
  id: string;
}

export interface SkillOrbSnapshot extends Vec2 {
  id: string;
  type: SkillType;
}

export interface SkillSlotSnapshot {
  type: SkillType | null;
  charges: 0 | 1;
}

export interface UseSkillPayload {
  skillActionSeq: number;
}

export interface RoomSnapshot {
  phase: GamePhase;
  canStart: boolean;
  pendingWinnerId: string | null;
  pendingWinnerTeamId?: TeamId | null;
  matchMode?: MatchMode;
  teamScores?: TeamScoreSnapshot[];
  players: Array<
    Pick<PlayerSnapshot, "id" | "nickname" | "characterId" | "color" | "isBot" | "connected" | "ready"> & AdminStats & { teamId?: TeamId | null }
  >;
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
  skillOrbs: SkillOrbSnapshot[];
  killFeed?: KillFeedEvent[];
  matchMode?: MatchMode;
  teamScores?: TeamScoreSnapshot[];
}

export interface TeamScoreSnapshot {
  teamId: TeamId;
  score: number;
  targetScore: number;
}

export type ExclusiveSkillEventStage = "telegraph" | "cast" | "impact" | "end";

export interface ExclusiveSkillEvent {
  eventSeq: number;
  serverTime: number;
  playerId: string;
  skillId: CharacterId;
  stage: ExclusiveSkillEventStage;
  origin: Vec2;
  target: Vec2;
  result: "applied" | "rejected";
}

export interface KillFeedEvent {
  id: string;
  at: number;
  killerId: string;
  victimId: string;
  streak: number;
}

export interface JoinPayload {
  nickname: string;
  characterId: CharacterId;
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

export type HostAdminCommand =
  | { type: "setStat"; playerId: string; stat: AdminStat; value: number }
  | { type: "kick"; playerId: string }
  | { type: "forceWinner"; playerId: string }
  | { type: "setMode"; mode: MatchMode }
  | { type: "swapTeams"; firstPlayerId: string; secondPlayerId: string }
  | { type: "forceTeamWinner"; teamId: TeamId };

export interface ClientToServerEvents {
  join: (payload: JoinPayload, acknowledge: (result: Ack<JoinResult>) => void) => void;
  changeCharacter: (characterId: CharacterId, acknowledge: (result: Ack) => void) => void;
  reconnectPlayer: (payload: ReconnectPayload, acknowledge: (result: Ack<JoinResult>) => void) => void;
  setReady: (ready: boolean, acknowledge: (result: Ack) => void) => void;
  returnToLobby: (acknowledge: (result: Ack) => void) => void;
  performanceHint: (hint: PerformanceHint) => void;
  playerInput: (input: PlayerInput) => void;
  useSkill: (payload: UseSkillPayload) => void;
  hostCommand: (payload: { token: string; command: HostCommand }, acknowledge: (result: Ack) => void) => void;
  hostAdminCommand: (payload: { token: string; command: HostAdminCommand }, acknowledge: (result: Ack) => void) => void;
}

export interface ServerToClientEvents {
  roomState: (snapshot: RoomSnapshot) => void;
  gameState: (snapshot: GameSnapshot | null) => void;
  skillEvent: (event: ExclusiveSkillEvent) => void;
  notice: (message: string) => void;
}

export interface ServerInfo {
  name: string;
  version: string;
  joinUrls: string[];
  qrDataUrls: string[];
  room: RoomSnapshot;
}
