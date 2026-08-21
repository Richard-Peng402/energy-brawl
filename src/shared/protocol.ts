import type { CharacterId } from "./character-catalog";
import type { MatchMode, TeamId } from "./mode-catalog";
import type { SkillType } from "./skill-catalog";
import type { ExclusiveSkillId } from "./exclusive-skill-catalog";
import type { CapturePointStateName } from "./capture-point";
import type { NetworkSnapshot } from "./network";
import type { MapId, MapSelection } from "./map-catalog";
import type { MapMechanicKind, MapMechanicPhase, MapMechanicZone } from "./map-mechanics";
import type { TacticalModuleId } from "./tactical-module-catalog";
import type { MapEventSnapshot } from "./map-events";
import type { MatchHighlight } from "./match-highlights";
import type { BotDifficulty } from "./bot-difficulty";
import type { RoomPresetV1 } from "./room-presets";
import type { EliminationPhase, EliminationRules } from "./team-elimination";
import type {
  ClientDiagnosticSample,
  DeviceDiagnosticProfile,
  DiagnosticReport,
  HostDiagnosticsSnapshot,
} from "./diagnostics";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect extends Vec2 {
  width: number;
  height: number;
}

export type GamePhase = "lobby" | "playing" | "overtime" | "finished";
export type RoomLifecyclePhase = "lobby" | "countdown" | "playing" | "results" | "roleSelect";

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

export type CombatStateId = "bulwark-suppression" | "phase-reveal" | "phase-fire-lock" | "neon-overdrive" | "crystal-resonance";
export interface CombatStateSnapshot { id: CombatStateId; startedAt: number; expiresAt: number; }

export interface MapMechanicParticipantSnapshot {
  playerId: string;
  chargeProgress: number;
  claimed: boolean;
}

export interface MapMechanicSnapshot {
  kind: MapMechanicKind;
  phase: MapMechanicPhase;
  round: number;
  zoneIndex: number;
  zone: MapMechanicZone;
  phaseStartedAt: number;
  phaseEndsAt: number;
  participants: MapMechanicParticipantSnapshot[];
}

export interface MapMechanicContribution {
  reactorEscapes: number;
  neonDamage: number;
  crystalResonances: number;
  mechanicHealing: number;
  mechanicEliminations: number;
}

export interface PlayerSnapshot extends Vec2 {
  id: string;
  nickname: string;
  characterId: CharacterId;
  tacticalModuleId?: TacticalModuleId;
  color: string;
  isBot: boolean;
  connected: boolean;
  controlOwner?: "human" | "bot";
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
  assists?: number;
  deaths?: number;
  damageDealt?: number;
  healingDone?: number;
  damageTaken?: number;
  skillContribution?: number;
  mapMechanicContribution?: MapMechanicContribution;
  lastDamageSourceId?: string | null;
  lastDamagedAt?: number | null;
  energyCollected: number;
  alive: boolean;
  respawnAt: number | null;
  shieldUntil: number;
  skillShieldHealth: number;
  skillShieldUntil: number;
  lastProcessedInput: number;
  skillSlot: SkillSlotSnapshot;
  lastProcessedSkillAction: number;
  lastProcessedExclusiveSkillAction?: number;
  teamId?: TeamId | null;
  exclusiveSkillCooldownMs?: number;
  exclusiveSkillReadyAt?: number;
  exclusiveSkillState?: { skillId: ExclusiveSkillId; startedAt: number; expiresAt: number; anchor?: Vec2; usedDash?: boolean } | null;
  combatStates?: readonly CombatStateSnapshot[];
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

export interface UseExclusiveSkillPayload {
  skillActionSeq: number;
  directionX: number;
  directionY: number;
}

export const TEAM_SIGNAL_KINDS = ["group", "attack", "retreat", "heal"] as const;
export type TeamSignalKind = (typeof TEAM_SIGNAL_KINDS)[number];

export interface TeamSignalPayload { kind: TeamSignalKind; }

export interface TeamSignalEvent {
  id: string;
  serverTime: number;
  senderId: string;
  senderName: string;
  teamId: TeamId;
  kind: TeamSignalKind;
}

export interface RoomSnapshot {
  phase: GamePhase;
  lifecyclePhase?: RoomLifecyclePhase;
  countdownEndsAt?: number | null;
  countdownRemainingMs?: number | null;
  canStart: boolean;
  pendingWinnerId: string | null;
  pendingWinnerTeamId?: TeamId | null;
  matchMode?: MatchMode;
  mapSelection?: MapSelection;
  activeMapId?: MapId | null;
  mapMechanicsEnabled?: boolean;
  mapEventsEnabled?: boolean;
  botDifficulty?: BotDifficulty;
  eliminationRules?: EliminationRules;
  teamScores?: TeamScoreSnapshot[];
  players: Array<
    Pick<PlayerSnapshot, "id" | "nickname" | "characterId" | "tacticalModuleId" | "color" | "isBot" | "connected" | "ready"> & AdminStats & { teamId?: TeamId | null }
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
  matchMvpId: string | null;
  matchMvpScore: number | null;
  matchHighlights?: MatchHighlight[];
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
  energy: EnergySnapshot[];
  skillOrbs: SkillOrbSnapshot[];
  killFeed?: KillFeedEvent[];
  matchMode?: MatchMode;
  mapId?: MapId;
  teamScores?: TeamScoreSnapshot[];
  captureScores?: TeamScoreSnapshot[];
  capturePoint?: CapturePointSnapshot | null;
  mapMechanic?: MapMechanicSnapshot | null;
  mapEvent?: MapEventSnapshot | null;
  exclusiveSkillEvents?: readonly ExclusiveSkillEvent[];
  projectileImpactEvents?: readonly ProjectileImpactEvent[];
  elimination?: EliminationSnapshot | null;
}

export type RoomDirectoryPhase = "lobby" | "playing" | "finished";

export interface RoomSummary {
  code: string;
  playerCount: number;
  maxPlayers: number;
  phase: RoomDirectoryPhase;
  matchMode?: MatchMode;
  mapSelection?: MapSelection;
}

export interface RoomDirectorySnapshot {
  rooms: RoomSummary[];
}

export interface EliminationRoundSummary {
  roundIndex: number;
  winnerTeamId: TeamId | null;
  reason: "eliminated" | "timeout" | "decisive" | "forced" | "draw";
  redAlive: number;
  blueAlive: number;
}

export interface EliminationSnapshot {
  phase: EliminationPhase;
  roundIndex: number;
  roundScores: TeamScoreSnapshot[];
  deadline: number;
  maxScoredRounds: number;
  decisive: boolean;
  rounds: EliminationRoundSummary[];
}

export interface CapturePointSnapshot extends Vec2 {
  radius: number;
  ownerTeamId: TeamId | null;
  progress: number;
  targetProgress: number;
  contestingTeams: TeamId[];
  state: CapturePointStateName;
}

export interface TeamScoreSnapshot {
  teamId: TeamId;
  score: number;
  targetScore: number;
}

export type ExclusiveSkillEventStage = "cast" | "active" | "end";

export interface ExclusiveSkillEvent {
  eventSeq: number;
  serverTime: number;
  playerId: string;
  skillId: ExclusiveSkillId;
  stage: ExclusiveSkillEventStage;
  origin: Vec2;
  target: Vec2;
  reason?: "expired" | "death" | "reset" | "return";
  metadata?: {
    healedTargetIds?: readonly string[];
    cleansedTargetIds?: readonly string[];
    affectedTargetIds?: readonly string[];
  };
}

export interface ProjectileImpactEvent {
  eventSeq: number;
  serverTime: number;
  projectileId: string;
  ownerId: string;
  targetId: string | null;
  kind: "wall" | "player" | "shield";
  position: Vec2;
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
  tacticalModuleId?: TacticalModuleId;
}

export interface ReconnectPayload {
  token: string;
  roomCode?: string;
}

export interface Ack<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface JoinResult {
  playerId: string;
  reconnectToken: string;
  roomCode?: string;
}

export interface RoomSelectionResult {
  roomCode: string;
  room: RoomSnapshot;
}

export interface PlayerHandoverEvent {
  playerId: string;
  controlOwner: "human" | "bot";
  serverTime: number;
}

export type HostCommand = "start" | "startCountdown" | "end" | "reset";

export type HostAdminCommand =
  | { type: "setStat"; playerId: string; stat: AdminStat; value: number }
  | { type: "kick"; playerId: string }
  | { type: "forceWinner"; playerId: string }
  | { type: "setMode"; mode: MatchMode }
  | { type: "setMap"; mapSelection: MapSelection }
  | { type: "setMapMechanics"; enabled: boolean }
  | { type: "setMapEvents"; enabled: boolean }
  | { type: "setBotDifficulty"; difficulty: BotDifficulty }
  | { type: "setEliminationRules"; rules: Partial<EliminationRules> }
  | { type: "applyRoomPreset"; preset: RoomPresetV1 }
  | { type: "swapTeams"; firstPlayerId: string; secondPlayerId: string }
  | { type: "forceTeamWinner"; teamId: TeamId };

export interface ClientToServerEvents {
  listRooms: (acknowledge: (result: Ack<RoomDirectorySnapshot>) => void) => void;
  createRoom: (acknowledge: (result: Ack<RoomSelectionResult>) => void) => void;
  joinRoom: (roomCode: string, acknowledge: (result: Ack<RoomSelectionResult>) => void) => void;
  quickJoin: (acknowledge: (result: Ack<RoomSelectionResult>) => void) => void;
  join: (payload: JoinPayload, acknowledge: (result: Ack<JoinResult>) => void) => void;
  changeCharacter: (characterId: CharacterId, acknowledge: (result: Ack) => void) => void;
  changeTacticalModule: (tacticalModuleId: TacticalModuleId, acknowledge: (result: Ack) => void) => void;
  reconnectPlayer: (payload: ReconnectPayload, acknowledge: (result: Ack<JoinResult>) => void) => void;
  setReady: (ready: boolean, acknowledge: (result: Ack) => void) => void;
  returnToLobby: (acknowledge: (result: Ack) => void) => void;
  performanceHint: (hint: PerformanceHint) => void;
  diagnosticsProfile: (profile: DeviceDiagnosticProfile) => void;
  diagnosticsSample: (sample: ClientDiagnosticSample) => void;
  diagnosticsPing: (sentAt: number, acknowledge: (sentAt: number) => void) => void;
  subscribeHostDiagnostics: (payload: { token: string }, acknowledge: (result: Ack) => void) => void;
  playerInput: (input: PlayerInput) => void;
  useSkill: (payload: UseSkillPayload) => void;
  useExclusiveSkill: (payload: UseExclusiveSkillPayload) => void;
  teamSignal: (payload: TeamSignalPayload) => void;
  hostCommand: (payload: { token: string; command: HostCommand }, acknowledge: (result: Ack) => void) => void;
  hostAdminCommand: (payload: { token: string; command: HostAdminCommand }, acknowledge: (result: Ack) => void) => void;
}

export interface ServerToClientEvents {
  roomDirectory: (snapshot: RoomDirectorySnapshot) => void;
  roomState: (snapshot: RoomSnapshot) => void;
  gameState: (snapshot: GameSnapshot | null) => void;
  notice: (message: string) => void;
  teamSignal: (event: TeamSignalEvent) => void;
  diagnosticsSession: (session: { matchId: string | null }) => void;
  hostDiagnostics: (snapshot: HostDiagnosticsSnapshot) => void;
  diagnosticReport: (report: DiagnosticReport) => void;
  playerHandover: (event: PlayerHandoverEvent) => void;
}

export interface ServerInfo {
  name: string;
  version: string;
  joinUrls: string[];
  qrDataUrls: string[];
  network: NetworkSnapshot;
  room: RoomSnapshot;
}
