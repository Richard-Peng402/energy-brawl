import { randomUUID } from "node:crypto";

import {
  DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS,
  LOBBY_RETURN_DELAY_MS,
  MAX_PLAYERS,
  RECONNECT_WINDOW_MS,
  SKILL_ACTION_MAX_JUMP,
} from "../shared/constants";
import { CHARACTER_CATALOG, getCharacter, isCharacterId, type CharacterId } from "../shared/character-catalog";
import { getModeDefinition, isMatchMode, type MatchMode, type TeamId } from "../shared/mode-catalog";
import type {
  Ack,
  AdminStat,
  GameSnapshot,
  HostAdminCommand,
  JoinPayload,
  JoinResult,
  PlayerInput,
  RoomSnapshot,
  UseSkillPayload,
} from "../shared/protocol";
import { chooseBotDecision } from "./bot";
import {
  applyPlayerInput,
  applyWorldSkillAction,
  createGameWorld,
  forceWorldTeamWinner,
  forceWorldWinner,
  refreshWorldScoreState,
  stepWorld,
  worldToSnapshot,
  type GameWorld,
  type PlayerSeed,
} from "./simulation";
import { clearSkillSlot } from "./skill-system";
import { assignBalancedTeams, hasDuplicateCharacterOnTeam, swapTeams } from "./team-system";

interface RoomSeat extends PlayerSeed {
  teamId: TeamId | null;
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
  private readonly pendingInputs = new Map<string, PlayerInput>();
  private readonly pendingSkillActions = new Map<string, UseSkillPayload>();
  private readonly kickedSocketIds: string[] = [];
  private world: GameWorld | null = null;
  private clockMs = 0;
  private autoResetAt: number | null = null;
  private nextPlayerNumber = 1;
  private pendingWinnerId: string | null = null;
  private pendingWinnerTeamId: TeamId | null = null;
  private matchMode: MatchMode = "solo";

  setMatchMode(mode: MatchMode): Ack {
    if (this.world) return { ok: false, error: "对局开始后无法切换模式" };
    if (!isMatchMode(mode)) return { ok: false, error: "模式无效" };
    this.matchMode = mode;
    this.pendingWinnerTeamId = null;
    assignBalancedTeams([...this.seats.values()], mode);
    return { ok: true };
  }

  swapPlayerTeams(firstId: string, secondId: string): Ack {
    if (this.world) return { ok: false, error: "对局开始后无法调整队伍" };
    if (this.matchMode === "solo") return { ok: false, error: "个人战没有队伍" };
    const seats = [...this.seats.values()];
    if (!swapTeams(seats, firstId, secondId)) return { ok: false, error: "无法交换队伍" };
    if (hasDuplicateCharacterOnTeam(seats)) {
      swapTeams(seats, firstId, secondId);
      return { ok: false, error: "同队角色不能重复" };
    }
    return { ok: true };
  }

  gameWorld(): GameWorld | null {
    return this.world;
  }

  consumeKickedSocketIds(): string[] {
    return this.kickedSocketIds.splice(0);
  }

  hasPlayer(playerId: string): boolean {
    return this.seats.has(playerId) && (!this.world || this.world.players.has(playerId));
  }

  applyHostAdminCommand(command: HostAdminCommand): Ack {
    if (this.world?.phase === "finished") return { ok: false, error: "当前阶段不可执行" };

    if (command.type === "setMode") return this.setMatchMode(command.mode);
    if (command.type === "swapTeams") return this.swapPlayerTeams(command.firstPlayerId, command.secondPlayerId);
    if (command.type === "forceTeamWinner") {
      if (this.matchMode === "solo") return { ok: false, error: "个人战没有团队胜者" };
      if (this.world) {
        if (!forceWorldTeamWinner(this.world, command.teamId)) return { ok: false, error: "强制团队获胜失败" };
        this.autoResetAt = this.clockMs + LOBBY_RETURN_DELAY_MS;
      } else {
        if (![...this.seats.values()].some((seat) => seat.teamId === command.teamId)) return { ok: false, error: "目标队伍不存在" };
        this.pendingWinnerTeamId = command.teamId;
        this.pendingWinnerId = null;
      }
      return { ok: true };
    }
    if (!this.hasPlayer(command.playerId)) return { ok: false, error: "目标玩家不存在" };

    if (command.type === "setStat") {
      return this.world
        ? this.applyWorldStat(command.playerId, command.stat, command.value)
        : this.applyLobbyStat(command.playerId, command.stat, command.value);
    }
    if (command.type === "kick") {
      return this.kickPlayer(command.playerId) ? { ok: true } : { ok: false, error: "踢出失败" };
    }
    if (this.world) {
      this.world.now = Math.max(this.world.now, this.clockMs);
      if (!forceWorldWinner(this.world, command.playerId)) return { ok: false, error: "强制获胜失败" };
      this.autoResetAt = this.clockMs + LOBBY_RETURN_DELAY_MS;
      return { ok: true };
    }
    this.pendingWinnerId = command.playerId;
    this.pendingWinnerTeamId = null;
    return { ok: true };
  }

  joinHuman(socketId: string, payload: JoinPayload): Ack<JoinResult> {
    if (this.world) return { ok: false, error: "对局已经开始，请等待下一局" };
    if (this.socketPlayers.has(socketId)) return { ok: false, error: "当前设备已经加入" };
    if (this.seats.size >= MAX_PLAYERS) return { ok: false, error: "房间已满" };

    const nickname = sanitizeNickname(payload.nickname);
    if (!nickname) return { ok: false, error: "请输入昵称" };
    if ([...this.seats.values()].some((seat) => seat.nickname === nickname)) {
      return { ok: false, error: "昵称已被使用" };
    }
    if (!isCharacterId(payload.characterId)) {
      return { ok: false, error: "请选择有效角色" };
    }
    if (this.matchMode === "solo" && [...this.seats.values()].some((seat) => seat.characterId === payload.characterId)) {
      return { ok: false, error: "这个角色已被使用" };
    }

    const id = `player-${this.nextPlayerNumber++}`;
    const reconnectToken = randomUUID();
    this.seats.set(id, {
      id,
      nickname,
      characterId: payload.characterId,
      isBot: false,
      socketId,
      reconnectToken,
      connected: true,
      ready: false,
      disconnectedAt: null,
      teamId: null,
    });
    assignBalancedTeams([...this.seats.values()], this.matchMode);
    if (hasDuplicateCharacterOnTeam([...this.seats.values()])) {
      this.seats.delete(id);
      return { ok: false, error: "同队角色不能重复" };
    }
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
      this.pendingInputs.delete(seat.id);
      this.pendingSkillActions.delete(seat.id);
      player.connected = true;
      player.isBot = false;
      player.lastProcessedInput = 0;
      player.lastProcessedSkillAction = 0;
      player.input = {
        seq: 0,
        moveX: 0,
        moveY: 0,
        aimX: Math.cos(player.angle),
        aimY: Math.sin(player.angle),
        firing: false,
      };
      player.vx = 0;
      player.vy = 0;
    }
    return { ok: true, data: { playerId: seat.id, reconnectToken: seat.reconnectToken } };
  }

  changeCharacter(socketId: string, characterId: CharacterId): Ack {
    if (this.world) return { ok: false, error: "对局开始后无法更换角色" };
    const seat = this.seatForSocket(socketId);
    if (!seat?.connected || seat.isBot) return { ok: false, error: "尚未加入房间" };
    if (seat.ready) return { ok: false, error: "请先取消准备再更换角色" };
    if (!isCharacterId(characterId)) return { ok: false, error: "请选择有效角色" };
    if ([...this.seats.values()].some((candidate) =>
      candidate.id !== seat.id &&
      candidate.characterId === characterId &&
      (this.matchMode === "solo" || candidate.teamId === seat.teamId)
    )) {
      return { ok: false, error: "这个角色已被使用" };
    }

    seat.characterId = characterId;
    seat.stats = undefined;
    return { ok: true };
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
    assignBalancedTeams([...this.seats.values()], this.matchMode);
    if (hasDuplicateCharacterOnTeam([...this.seats.values()])) return { ok: false, error: "同队角色不能重复" };
    this.world = createGameWorld([...this.seats.values()], this.clockMs, this.matchMode);
    this.autoResetAt = null;
    this.pendingInputs.clear();
    this.pendingSkillActions.clear();
    for (const seat of this.seats.values()) {
      const player = this.world.players.get(seat.id);
      if (!player) continue;
      player.connected = seat.connected;
      player.ready = seat.ready || seat.isBot;
    }
    const pendingWinnerId = this.pendingWinnerId;
    const pendingWinnerTeamId = this.pendingWinnerTeamId;
    this.pendingWinnerId = null;
    this.pendingWinnerTeamId = null;
    if (pendingWinnerId && forceWorldWinner(this.world, pendingWinnerId)) {
      this.autoResetAt = this.clockMs + LOBBY_RETURN_DELAY_MS;
    } else if (pendingWinnerTeamId && forceWorldTeamWinner(this.world, pendingWinnerTeamId)) {
      this.autoResetAt = this.clockMs + LOBBY_RETURN_DELAY_MS;
    }
    return { ok: true };
  }

  endMatch(): Ack {
    if (!this.world) return { ok: false, error: "当前没有进行中的对局" };
    if (this.world.phase === "finished") return { ok: false, error: "Match already finished" };
    this.world.phase = "finished";
    this.world.winnerIds = [];
    this.world.finishedAt = this.world.now;
    this.world.projectiles.clear();
    this.autoResetAt = this.clockMs + LOBBY_RETURN_DELAY_MS;
    return { ok: true };
  }

  returnToLobby(socketId: string): Ack {
    const seat = this.seatForSocket(socketId);
    if (!seat?.connected || seat.isBot) return { ok: false, error: "Player is not seated" };
    if (!this.world || this.world.phase !== "finished") return { ok: false, error: "Match is not finished" };
    return this.resetToLobby();
  }

  resetToLobby(): Ack {
    this.world = null;
    this.autoResetAt = null;
    this.kickedSocketIds.splice(0);
    this.nextBotThinkAt.clear();
    this.pendingInputs.clear();
    this.pendingSkillActions.clear();
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
    this.pendingInputs.delete(playerId);
    this.pendingSkillActions.delete(playerId);
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
    if (!seat || !seat.connected || seat.isBot || !this.world || this.world.phase === "finished") return false;
    if (!Number.isSafeInteger(input.seq) || input.seq < 0) return false;
    const player = this.world.players.get(seat.id);
    const queued = this.pendingInputs.get(seat.id);
    if (!player || input.seq <= player.lastProcessedInput || (queued && input.seq <= queued.seq)) return false;
    this.pendingInputs.set(seat.id, { ...input });
    return true;
  }

  handleSkillAction(socketId: string, payload: UseSkillPayload): boolean {
    const seat = this.seatForSocket(socketId);
    if (!seat || !seat.connected || seat.isBot || !this.world || this.world.phase === "finished") return false;
    if (!Number.isSafeInteger(payload.skillActionSeq) || payload.skillActionSeq < 0) return false;
    const player = this.world.players.get(seat.id);
    const queued = this.pendingSkillActions.get(seat.id);
    if (
      !player ||
      payload.skillActionSeq <= player.lastProcessedSkillAction ||
      payload.skillActionSeq - player.lastProcessedSkillAction > SKILL_ACTION_MAX_JUMP ||
      (queued && payload.skillActionSeq <= queued.skillActionSeq)
    ) return false;
    this.pendingSkillActions.set(seat.id, { skillActionSeq: payload.skillActionSeq });
    return true;
  }

  tick(deltaMs: number): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false;
    this.clockMs += deltaMs;
    const lifecycleChanged = this.expireReconnectTokens();
    if (!this.world) return lifecycleChanged;
    if (this.world.phase === "finished") {
      if (this.autoResetAt === null) this.autoResetAt = this.clockMs + LOBBY_RETURN_DELAY_MS;
      if (this.clockMs >= this.autoResetAt) {
        this.resetToLobby();
        return true;
      }
      return lifecycleChanged;
    }

    const wasFinished = this.worldIsFinished();

    for (const [playerId, input] of this.pendingInputs) applyPlayerInput(this.world, playerId, input);
    this.pendingInputs.clear();
    for (const [playerId, action] of this.pendingSkillActions) {
      applyWorldSkillAction(this.world, playerId, action.skillActionSeq);
    }
    this.pendingSkillActions.clear();

    for (const player of this.world.players.values()) {
      if (!player.isBot || this.clockMs < (this.nextBotThinkAt.get(player.id) ?? 0)) continue;
      const decision = chooseBotDecision(this.world, player.id);
      applyPlayerInput(this.world, player.id, decision.input);
      if (decision.useSkill) applyWorldSkillAction(this.world, player.id, player.lastProcessedSkillAction + 1);
      this.nextBotThinkAt.set(player.id, this.clockMs + 500 + Math.random() * 250);
    }
    stepWorld(this.world, deltaMs);
    if (this.worldIsFinished() && this.autoResetAt === null) {
      this.autoResetAt = this.clockMs + LOBBY_RETURN_DELAY_MS;
    }
    return lifecycleChanged || (!wasFinished && this.worldIsFinished());
  }

  snapshot(): RoomSnapshot {
    const players = this.world
      ? worldToSnapshot(this.world).players
      : [...this.seats.values()].map((seat) => {
          const character = getCharacter(seat.characterId);
          const maxHealth = Math.max(seat.stats?.maxHealth ?? character.maxHealth, seat.stats?.health ?? 0);
          return {
            id: seat.id,
            nickname: seat.nickname,
            characterId: seat.characterId,
            color: character.color,
            isBot: seat.isBot,
            connected: seat.connected,
            ready: seat.ready,
            teamId: seat.teamId,
            health: Math.min(seat.stats?.health ?? maxHealth, maxHealth),
            maxHealth,
            damage: seat.stats?.damage ?? character.damage,
            score: seat.stats?.score ?? 0,
            moveSpeed: seat.stats?.moveSpeed ?? character.moveSpeed,
            fireCooldownMs: seat.stats?.fireCooldownMs ?? character.fireCooldownMs,
            projectileSpeed: seat.stats?.projectileSpeed ?? character.projectileSpeed,
            kills: seat.stats?.kills ?? 0,
            energyCollected: seat.stats?.energyCollected ?? 0,
            exclusiveSkillCooldownMs: seat.stats?.exclusiveSkillCooldownMs ?? DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS,
          };
        });
    return {
      phase: this.world?.phase ?? "lobby",
      canStart: this.canStart(),
      pendingWinnerId: this.pendingWinnerId,
      pendingWinnerTeamId: this.pendingWinnerTeamId,
      matchMode: this.matchMode,
      teamScores: this.world
        ? worldToSnapshot(this.world).teamScores
        : [...new Set([...this.seats.values()].map((seat) => seat.teamId).filter((teamId): teamId is TeamId => teamId !== null))].map((teamId) => ({
            teamId,
            score: 0,
            targetScore: getModeDefinition(this.matchMode).targetScore,
          })),
      players: players.map(({ id, nickname, characterId, color, isBot, connected, ready, teamId, health, maxHealth, damage, score, moveSpeed, fireCooldownMs, projectileSpeed, kills, energyCollected, exclusiveSkillCooldownMs }) => ({
        id,
        nickname,
        characterId,
        color,
        isBot,
        connected,
        ready,
        health,
        maxHealth,
        damage,
        score,
        moveSpeed,
        fireCooldownMs,
        projectileSpeed,
        kills,
        energyCollected,
        exclusiveSkillCooldownMs,
        teamId: teamId ?? null,
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

  private worldIsFinished(): boolean {
    return this.world?.phase === "finished";
  }

  private kickPlayer(playerId: string): boolean {
    const seat = this.seats.get(playerId);
    const player = this.world?.players.get(playerId);
    if (!seat || (this.world && !player)) return false;

    if (seat.socketId) {
      this.socketPlayers.delete(seat.socketId);
      this.kickedSocketIds.push(seat.socketId);
    }
    this.pendingInputs.delete(playerId);
    this.pendingSkillActions.delete(playerId);
    if (!this.world) {
      this.seats.delete(playerId);
      if (this.pendingWinnerId === playerId) this.pendingWinnerId = null;
      return true;
    }
    seat.socketId = null;
    seat.reconnectToken = null;
    seat.connected = false;
    seat.ready = true;
    seat.disconnectedAt = null;
    seat.isBot = true;
    player!.connected = false;
    player!.isBot = true;
    player!.input = {
      seq: player!.lastProcessedInput,
      moveX: 0,
      moveY: 0,
      aimX: Math.cos(player!.angle),
      aimY: Math.sin(player!.angle),
      firing: false,
    };
    player!.vx = 0;
    player!.vy = 0;
    clearSkillSlot(player!);
    this.nextBotThinkAt.set(playerId, this.clockMs);
    return true;
  }

  private applyLobbyStat(playerId: string, stat: AdminStat, value: number): Ack {
    const seat = this.seats.get(playerId);
    if (!seat) return { ok: false, error: "目标玩家不存在" };
    const character = getCharacter(seat.characterId);
    const stats = {
      health: seat.stats?.health ?? character.maxHealth,
      maxHealth: seat.stats?.maxHealth ?? character.maxHealth,
      damage: seat.stats?.damage ?? character.damage,
      score: seat.stats?.score ?? 0,
      moveSpeed: seat.stats?.moveSpeed ?? character.moveSpeed,
      fireCooldownMs: seat.stats?.fireCooldownMs ?? character.fireCooldownMs,
      projectileSpeed: seat.stats?.projectileSpeed ?? character.projectileSpeed,
      kills: seat.stats?.kills ?? 0,
      energyCollected: seat.stats?.energyCollected ?? 0,
      exclusiveSkillCooldownMs: seat.stats?.exclusiveSkillCooldownMs ?? DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS,
    };
    if (stat === "health" && value > stats.maxHealth) stats.maxHealth = value;
    stats[stat] = value;
    if (stat === "maxHealth") stats.health = Math.min(stats.health, stats.maxHealth);
    seat.stats = stats;
    return { ok: true };
  }

  private applyWorldStat(playerId: string, stat: AdminStat, value: number): Ack {
    const player = this.world?.players.get(playerId);
    if (!player || !this.world) return { ok: false, error: "目标玩家不存在" };
    const previousHealth = player.health;
    switch (stat) {
      case "health":
        if (value > player.maxHealth) player.maxHealth = value;
        player.health = value;
        break;
      case "maxHealth":
        player.maxHealth = value;
        player.health = Math.min(player.health, player.maxHealth);
        break;
      case "damage": player.damage = value; break;
      case "score":
        player.score = value;
        refreshWorldScoreState(this.world, player.id);
        break;
      case "moveSpeed": player.moveSpeed = value; break;
      case "fireCooldownMs": player.fireCooldownMs = value; break;
      case "projectileSpeed": player.projectileSpeed = value; break;
      case "kills": player.kills = value; break;
      case "energyCollected": player.energyCollected = value; break;
      case "exclusiveSkillCooldownMs": player.exclusiveSkillCooldownMs = value; break;
    }
    if (player.health < previousHealth) {
      player.lastCombatAt = this.world.now;
      player.regenAccumulatorMs = 0;
    }
    return { ok: true };
  }

  private seatForSocket(socketId: string): RoomSeat | undefined {
    const id = this.socketPlayers.get(socketId);
    return id ? this.seats.get(id) : undefined;
  }

  private fillBotSeats(): void {
    while (this.seats.size < MAX_PLAYERS) {
      const index = this.seats.size;
      const character = CHARACTER_CATALOG.find(
        (candidate) => ![...this.seats.values()].some((seat) => seat.characterId === candidate.id),
      );
      if (!character) break;
      const id = `bot-${this.nextPlayerNumber++}`;
      this.seats.set(id, {
        id,
        nickname: BOT_NAMES[index % BOT_NAMES.length] ?? `机器人 ${index + 1}`,
        characterId: character.id,
        isBot: true,
        socketId: null,
        reconnectToken: null,
        connected: false,
        ready: true,
        disconnectedAt: null,
        teamId: null,
      });
      assignBalancedTeams([...this.seats.values()], this.matchMode);
    }
  }

  private removeDisconnectedLobbySeats(): void {
    for (const [id, seat] of this.seats) {
      if (!seat.connected) this.seats.delete(id);
    }
  }

  private expireReconnectTokens(): boolean {
    let lifecycleChanged = false;
    for (const [id, seat] of this.seats) {
      if (seat.disconnectedAt === null || this.clockMs - seat.disconnectedAt <= RECONNECT_WINDOW_MS) continue;
      if (!this.world) {
        this.seats.delete(id);
        lifecycleChanged = true;
        continue;
      }
      seat.reconnectToken = null;
      seat.isBot = true;
      const player = this.world?.players.get(seat.id);
      if (player) {
        player.isBot = true;
        clearSkillSlot(player);
      }
    }

    if (this.world && ![...this.seats.values()].some((seat) => !seat.isBot)) {
      this.resetToLobby();
      lifecycleChanged = true;
    }
    return lifecycleChanged;
  }
}

function sanitizeNickname(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 12);
}
