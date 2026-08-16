import type { CharacterId } from "./character-catalog";
import type { MatchMode, TeamId } from "./mode-catalog";
import type { SkillType } from "./skill-catalog";
import type { ExclusiveSkillId } from "./exclusive-skill-catalog";
import type { CapturePointStateName } from "./capture-point";
import type { NetworkSnapshot } from "./network";
import type { MapId, MapSelection } from "./map-catalog";
import type { MapMechanicKind, MapMechanicPhase, MapMechanicZone } from "./map-mechanics";
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

export interface RoomSnapshot {
  phase: GamePhase;
  canStart: boolean;
  pendingWinnerId: string | null;
  pendingWinnerTeamId?: TeamId | null;
  matchMode?: MatchMode;
  mapSelection?: MapSelection;
  activeMapId?: MapId | null;
  mapMechanicsEnabled?: boolean;
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
  matchMvpId: string | null;
  matchMvpScore: number | null;
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
  exclusiveSkillEvents?: readonly ExclusiveSkillEvent[];
  projectileImpactEvents?: readonly ProjectileImpactEvent[];
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
  | { type: "setMap"; mapSelection: MapSelection }
  | { type: "setMapMechanics"; enabled: boolean }
  | { type: "swapTeams"; firstPlayerId: string; secondPlayerId: string }
  | { type: "forceTeamWinner"; teamId: TeamId };

export interface ClientToServerEvents {
  join: (payload: JoinPayload, acknowledge: (result: Ack<JoinResult>) => void) => void;
  changeCharacter: (characterId: CharacterId, acknowledge: (result: Ack) => void) => void;
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
  hostCommand: (payload: { token: string; command: HostCommand }, acknowledge: (result: Ack) => void) => void;
  hostAdminCommand: (payload: { token: string; command: HostAdminCommand }, acknowledge: (result: Ack) => void) => void;
}

export interface ServerToClientEvents {
  roomState: (snapshot: RoomSnapshot) => void;
  gameState: (snapshot: GameSnapshot | null) => void;
  notice: (message: string) => void;
  diagnosticsSession: (session: { matchId: string | null }) => void;
  hostDiagnostics: (snapshot: HostDiagnosticsSnapshot) => void;
  diagnosticReport: (report: DiagnosticReport) => void;
}

export interface ServerInfo {
  name: string;
  version: string;
  joinUrls: string[];
  qrDataUrls: string[];
  network: NetworkSnapshot;
  room: RoomSnapshot;
}
