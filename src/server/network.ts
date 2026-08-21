import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";

import { Server, type Socket } from "socket.io";

import { performance } from "node:perf_hooks";

import { REDUCED_SNAPSHOT_RATE, SERVER_TICK_MS, SNAPSHOT_RATE } from "../shared/constants";
import {
  sanitizeClientDiagnosticSample,
  sanitizeDeviceDiagnosticProfile,
  isDiagnosticPayloadWithinLimit,
  type DeviceDiagnosticProfile,
  type DiagnosticEndReason,
  type ServerDiagnosticSample,
} from "../shared/diagnostics";
import type {
  Ack,
  ClientToServerEvents,
  HostAdminCommand,
  HostCommand,
  GameSnapshot,
  JoinPayload,
  PerformanceHint,
  PlayerInput,
  ServerToClientEvents,
  UseExclusiveSkillPayload,
  UseSkillPayload,
  TeamSignalPayload,
  RoomDirectorySnapshot,
  RoomSelectionResult,
} from "../shared/protocol";
import { TEAM_SIGNAL_KINDS } from "../shared/protocol";
import { isCharacterId } from "../shared/character-catalog";
import { isMatchMode, TEAM_IDS } from "../shared/mode-catalog";
import { MAP_CATALOG } from "../shared/map-catalog";
import { isBotDifficulty } from "../shared/bot-difficulty";
import { normalizeRoomPreset } from "../shared/room-presets";
import { normalizeEliminationRules } from "../shared/team-elimination";
import { isTacticalModuleId } from "../shared/tactical-module-catalog";
import { GameRoom } from "./room";
import { FixedStepAccumulator } from "./fixed-loop";
import { RollingMetric } from "./performance";
import { authorizeHostAccess, HostAdminService } from "./host-admin";
import { DiagnosticsSession } from "./diagnostics-session";
import { maskNetworkAddress } from "./network-address";
import { RoomDirectory, type DirectoryRoom, normalizeRoomCode } from "./room-directory";

interface InterServerEvents {}
const SNAPSHOT_DEADLINE_EPSILON_MS = 1e-6;
const TEAM_SIGNAL_COOLDOWN_MS = 800;

interface SocketData {
  snapshotRate: 20 | 30;
  nextSnapshotAt: number;
  lastDiagnosticsAt: number;
  hostDiagnosticsAuthorized: boolean;
  roomCode: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface GameNetwork {
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  advance: (deltaMs: number) => void;
  poll: (nowMs: number) => number;
  diagnosticsTiming: () => ReturnType<RollingMetric["snapshot"]>;
  close: () => Promise<void>;
}

export interface GameNetworkOptions {
  autoPoll?: boolean;
}

export function attachGameNetwork(
  httpServer: HttpServer,
  room: GameRoom,
  hostToken: string,
  allowedLanAddresses: () => readonly string[] = () => [],
  gameVersion = "unknown",
  diagnosticsNow: () => number = Date.now,
  options: GameNetworkOptions = {},
): GameNetwork {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: { origin: true, credentials: false },
    allowRequest: (request, callback) => callback(null, isAllowedLanOrigin(request.headers.origin, allowedLanAddresses())),
    transports: ["websocket", "polling"],
  });
  const directory = new RoomDirectory();
  const publicEntry = directory.registerRoom("AAAAAA", room, "public-host");
  const socketRooms = new Map<string, DirectoryRoom>();
  const lastInputAt = new Map<string, number>();
  const fixedLoop = new FixedStepAccumulator(SERVER_TICK_MS, 3);
  const simulationDuration = new RollingMetric();
  const diagnosticsDuration = new RollingMetric();
  const hostAdmin = new HostAdminService(hostToken);
  const diagnostics = new DiagnosticsSession(gameVersion);
  const diagnosticProfiles = new Map<string, DeviceDiagnosticProfile>();
  let snapshotOpportunityMs = 0;
  let diagnosticWindowMs = 0;
  let acceptedDiagnosticSamples = 0;
  let rejectedDiagnosticSamples = 0;
  let previousCatchUpLimitHits = 0;
  let activeDiagnosticsMatchId: string | null = null;
  let activeDiagnosticsEntry: DirectoryRoom | null = null;
  let latestGameSnapshot: GameSnapshot | null = null;
  const lastTeamSignalAt = new Map<string, number>();

  const roomForSocket = (socketId: string): DirectoryRoom => socketRooms.get(socketId) ?? publicEntry;
  const emitRoomDirectory = () => io.emit("roomDirectory", { rooms: directory.list() } satisfies RoomDirectorySnapshot);
  const roomSelection = (entry: DirectoryRoom): RoomSelectionResult => ({ roomCode: entry.code, room: entry.room.snapshot() });
  const channelFor = (entry: DirectoryRoom) => `room:${entry.code}`;
  const broadcastEntryRoom = (entry: DirectoryRoom) => {
    io.to(channelFor(entry)).emit("roomState", entry.room.snapshot());
    for (const event of entry.room.consumeHandoverEvents()) io.to(channelFor(entry)).emit("playerHandover", event);
  };
  const broadcastEntryGame = (entry: DirectoryRoom) => io.to(channelFor(entry)).emit("gameState", entry.room.gameSnapshot());
  const selectRoom = async (socket: GameSocket, entry: DirectoryRoom): Promise<void> => {
    const previous = roomForSocket(socket.id);
    if (previous !== entry) {
      previous.room.leave(socket.id);
      await socket.leave(channelFor(previous));
      broadcastEntryRoom(previous);
      broadcastEntryTransition(previous);
      directory.markActivity(previous);
    }
    socketRooms.set(socket.id, entry);
    socket.data.roomCode = entry.code;
    await socket.join(channelFor(entry));
  };

  const broadcastEntryTransition = (entry: DirectoryRoom): GameSnapshot | null => {
    const snapshot = entry.room.gameSnapshot();
    if (entry === publicEntry) latestGameSnapshot = snapshot;
    io.to(channelFor(entry)).emit("gameState", snapshot);
    return snapshot;
  };
  const emitDiagnosticsSnapshot = (now = diagnosticsNow()) => io.to("host-diagnostics").emit("hostDiagnostics", diagnostics.snapshot(now));
  const finishDiagnostics = (reason: DiagnosticEndReason) => {
    if (!activeDiagnosticsMatchId) return;
    const report = diagnostics.finish(diagnosticsNow(), reason);
    activeDiagnosticsMatchId = null;
    activeDiagnosticsEntry = null;
    io.emit("diagnosticsSession", { matchId: null });
    if (report) io.to("host-diagnostics").emit("diagnosticReport", report);
  };
  const startDiagnostics = (entry: DirectoryRoom, reasonIfAlreadyFinished: DiagnosticEndReason = "forced") => {
    const game = entry.room.gameSnapshot();
    const roomSnapshot = entry.room.snapshot();
    if (!game?.mapId || !roomSnapshot.matchMode) return;
    const matchId = randomUUID();
    diagnostics.start({
      matchId,
      mapId: game.mapId,
      matchMode: roomSnapshot.matchMode,
      startedAt: diagnosticsNow(),
      players: game.players.filter((player) => !player.isBot).map((player) => {
        const playerSocket = [...io.sockets.sockets.values()].find((candidate) => roomForSocket(candidate.id) === entry && entry.room.playerIdForSocket(candidate.id) === player.id);
        return {
          playerId: player.id,
          nickname: player.nickname,
          characterId: player.characterId,
          address: maskNetworkAddress(playerSocket?.handshake.address),
        };
      }),
    });
    activeDiagnosticsMatchId = matchId;
    activeDiagnosticsEntry = entry;
    for (const socket of io.sockets.sockets.values()) {
      const playerId = entry.room.playerIdForSocket(socket.id);
      const profile = diagnosticProfiles.get(socket.id);
      if (playerId && profile) diagnostics.setProfile(playerId, profile, maskNetworkAddress(socket.handshake.address));
    }
    io.emit("diagnosticsSession", { matchId });
    emitDiagnosticsSnapshot();
    if (game.phase === "finished") finishDiagnostics(reasonIfAlreadyFinished);
  };
  const disconnectKickedSockets = (entry: DirectoryRoom) => {
    for (const socketId of entry.room.consumeKickedSocketIds()) {
      io.sockets.sockets.get(socketId)?.disconnect(true);
    }
  };
  const revokeHostDiagnostics = (socket: GameSocket) => {
    if (!socket.data.hostDiagnosticsAuthorized) return;
    socket.data.hostDiagnosticsAuthorized = false;
    void socket.leave("host-diagnostics");
  };
  const broadcastVolatileSnapshots = () => {
    for (const entry of directory.entries()) {
      const snapshot = entry.room.gameSnapshot();
      if (entry === publicEntry) latestGameSnapshot = snapshot;
      if (!snapshot) continue;
      for (const socket of io.sockets.sockets.values()) {
        if (roomForSocket(socket.id) !== entry) continue;
        if (snapshot.serverTime + SNAPSHOT_DEADLINE_EPSILON_MS < socket.data.nextSnapshotAt) continue;
        socket.volatile.emit("gameState", snapshot);
        socket.data.nextSnapshotAt = advanceSnapshotDeadline(
          socket.data.nextSnapshotAt,
          snapshot.serverTime,
          socket.data.snapshotRate,
        );
      }
    }
  };

  io.on("connection", (socket) => {
    socket.data.snapshotRate = SNAPSHOT_RATE;
    socket.data.nextSnapshotAt = 0;
    socket.data.lastDiagnosticsAt = Number.NEGATIVE_INFINITY;
    socket.data.hostDiagnosticsAuthorized = false;
    socket.data.roomCode = publicEntry.code;
    socketRooms.set(socket.id, publicEntry);
    void socket.join(channelFor(publicEntry));
    socket.emit("roomState", room.snapshot());
    socket.emit("roomDirectory", { rooms: directory.list() });
    const currentGame = room.gameSnapshot();
    latestGameSnapshot = currentGame;
    if (currentGame) socket.emit("gameState", currentGame);
    socket.emit("diagnosticsSession", { matchId: activeDiagnosticsMatchId });
    const activeEntry = () => roomForSocket(socket.id);
    const activeRoom = () => activeEntry().room;

    socket.on("listRooms", (acknowledge) => {
      sendAcknowledgement(acknowledge, { ok: true, data: { rooms: directory.list() } });
    });

    socket.on("createRoom", async (acknowledge) => {
      const entry = directory.createRoom(socket.id);
      await selectRoom(socket, entry);
      socket.emit("roomState", entry.room.snapshot());
      emitRoomDirectory();
      sendAcknowledgement(acknowledge, { ok: true, data: roomSelection(entry) });
    });

    socket.on("joinRoom", async (roomCode, acknowledge) => {
      const entry = directory.get(normalizeRoomCode(roomCode));
      if (!entry || !["lobby", "roleSelect"].includes(entry.room.snapshot().lifecyclePhase ?? "lobby") || entry.room.playerCount() >= 6) {
        sendAcknowledgement(acknowledge, { ok: false, error: "房间不存在、已开始或已满" });
        return;
      }
      await selectRoom(socket, entry);
      socket.emit("roomState", entry.room.snapshot());
      emitRoomDirectory();
      sendAcknowledgement(acknowledge, { ok: true, data: roomSelection(entry) });
    });

    socket.on("quickJoin", async (acknowledge) => {
      const entry = directory.findJoinable() ?? directory.createRoom(socket.id);
      await selectRoom(socket, entry);
      socket.emit("roomState", entry.room.snapshot());
      emitRoomDirectory();
      sendAcknowledgement(acknowledge, { ok: true, data: roomSelection(entry) });
    });

    socket.on("join", (payload, acknowledge) => {
      const result = isJoinPayload(payload)
        ? activeRoom().joinHuman(socket.id, payload)
        : invalid<import("../shared/protocol").JoinResult>("加入信息格式不正确");
      if (result.ok && result.data) result.data.roomCode = activeEntry().code;
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        revokeHostDiagnostics(socket);
        directory.markActivity(activeEntry());
        broadcastEntryRoom(activeEntry());
        emitRoomDirectory();
      }
    });

    socket.on("changeCharacter", (characterId, acknowledge) => {
      const result = isCharacterId(characterId)
        ? activeRoom().changeCharacter(socket.id, characterId)
        : invalid("请选择有效角色");
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        revokeHostDiagnostics(socket);
        broadcastEntryRoom(activeEntry());
      }
    });

    socket.on("changeTacticalModule", (tacticalModuleId, acknowledge) => {
      const result = isTacticalModuleId(tacticalModuleId)
        ? activeRoom().changeTacticalModule(socket.id, tacticalModuleId)
        : invalid("战术模组无效");
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        revokeHostDiagnostics(socket);
        broadcastEntryRoom(activeEntry());
      }
    });

    socket.on("reconnectPlayer", async (payload, acknowledge) => {
      const entry = payload && typeof payload.token === "string"
        ? (payload.roomCode ? directory.get(payload.roomCode) : directory.findByReconnectToken(payload.token))
        : undefined;
      if (entry) await selectRoom(socket, entry);
      const result = entry && typeof payload?.token === "string"
        ? entry.room.reconnectHuman(socket.id, payload.token)
        : invalid<import("../shared/protocol").JoinResult>("重连信息格式不正确或房间已失效");
      if (result.ok && result.data) result.data.roomCode = entry!.code;
      sendAcknowledgement(acknowledge, result);
      if (result.ok && entry) {
        revokeHostDiagnostics(socket);
        broadcastEntryRoom(entry);
        broadcastEntryGame(entry);
        const playerId = entry.room.playerIdForSocket(socket.id);
        if (playerId && activeDiagnosticsMatchId && entry === publicEntry) diagnostics.recordReconnect(playerId, diagnosticsNow());
      }
    });

    socket.on("setReady", (ready, acknowledge) => {
      const result = activeRoom().setReady(socket.id, ready === true);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) broadcastEntryRoom(activeEntry());
    });

    socket.on("returnToLobby", (acknowledge) => {
      const result = activeRoom().returnToLobby(socket.id);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        broadcastEntryRoom(activeEntry());
        broadcastEntryTransition(activeEntry());
      }
    });

    socket.on("performanceHint", (hint) => {
      if (!isPerformanceHint(hint)) return;
      socket.data.snapshotRate = hint.snapshotMode === "reduced" ? REDUCED_SNAPSHOT_RATE : SNAPSHOT_RATE;
    });

    socket.on("diagnosticsProfile", (profile) => {
      if (!isDiagnosticPayloadWithinLimit(profile)) return;
      const sanitizedProfile = sanitizeDeviceDiagnosticProfile(profile);
      if (!sanitizedProfile) return;
      diagnosticProfiles.set(socket.id, sanitizedProfile);
      const entry = activeEntry();
      const playerId = entry.room.playerIdForSocket(socket.id);
      if (playerId && activeDiagnosticsMatchId && activeDiagnosticsEntry === entry) diagnostics.setProfile(playerId, sanitizedProfile, maskNetworkAddress(socket.handshake.address));
    });

    socket.on("diagnosticsSample", (sample) => {
      const diagnosticsStartedAt = performance.now();
      const now = diagnosticsNow();
      const entry = activeEntry();
      const playerId = entry.room.playerIdForSocket(socket.id);
      const sanitizedSample = isDiagnosticPayloadWithinLimit(sample) ? sanitizeClientDiagnosticSample(sample) : null;
      if (!playerId || entry !== activeDiagnosticsEntry || !sanitizedSample || sanitizedSample.matchId !== activeDiagnosticsMatchId || now - socket.data.lastDiagnosticsAt < 750) {
        rejectedDiagnosticSamples += 1;
        diagnosticsDuration.add(performance.now() - diagnosticsStartedAt);
        return;
      }
      socket.data.lastDiagnosticsAt = now;
      if (diagnostics.acceptClientSample(playerId, sanitizedSample, now)) acceptedDiagnosticSamples += 1;
      else rejectedDiagnosticSamples += 1;
      diagnosticsDuration.add(performance.now() - diagnosticsStartedAt);
    });

    socket.on("diagnosticsPing", (sentAt, acknowledge) => {
      if (Number.isFinite(sentAt) && typeof acknowledge === "function") acknowledge(sentAt);
    });

    socket.on("subscribeHostDiagnostics", (payload, acknowledge) => {
      const entry = activeEntry();
      const access = payload && typeof payload.token === "string"
        ? authorizeHostAccess(socket.handshake.address, payload.token, hostToken)
        : invalid("房主权限无效");
      const result = access.ok && entry.room.playerIdForSocket(socket.id)
        ? invalid("玩家连接不能订阅房主诊断")
        : access;
      if (result.ok) {
        socket.data.hostDiagnosticsAuthorized = true;
        void socket.join("host-diagnostics");
        socket.emit("hostDiagnostics", diagnostics.snapshot(diagnosticsNow()));
        if (diagnostics.latestReport) socket.emit("diagnosticReport", diagnostics.latestReport);
      }
      sendAcknowledgement(acknowledge, result);
    });

    socket.on("playerInput", (input) => {
      const now = Date.now();
      if (now - (lastInputAt.get(socket.id) ?? 0) < 15 || !isPlayerInput(input)) return;
      lastInputAt.set(socket.id, now);
      activeRoom().handleInput(socket.id, input);
    });

    socket.on("useSkill", (payload) => {
      if (isUseSkillPayload(payload)) activeRoom().handleSkillAction(socket.id, payload);
    });

    socket.on("useExclusiveSkill", (payload) => {
      if (isUseExclusiveSkillPayload(payload)) activeRoom().handleExclusiveSkillAction(socket.id, payload);
    });

    socket.on("teamSignal", (payload) => {
      const entry = activeEntry();
      const playerId = entry.room.playerIdForSocket(socket.id);
      const snapshot = entry.room.snapshot();
      const sender = playerId ? snapshot.players.find((player) => player.id === playerId) : undefined;
      if (!playerId || !sender?.connected || sender.teamId == null || (snapshot.phase !== "playing" && snapshot.phase !== "overtime") || !isTeamMatchMode(snapshot.matchMode) || !isTeamSignalPayload(payload)) return;
      const now = Date.now();
      if (now - (lastTeamSignalAt.get(playerId) ?? Number.NEGATIVE_INFINITY) < TEAM_SIGNAL_COOLDOWN_MS) return;
      lastTeamSignalAt.set(playerId, now);
      const event = {
        id: randomUUID(),
        serverTime: entry.room.gameSnapshot()?.serverTime ?? now,
        senderId: playerId,
        senderName: sender.nickname,
        teamId: sender.teamId,
        kind: payload.kind,
      } as const;
      for (const target of io.sockets.sockets.values()) {
        if (roomForSocket(target.id) !== entry) continue;
        const targetId = entry.room.playerIdForSocket(target.id);
        const targetSeat = targetId ? snapshot.players.find((player) => player.id === targetId) : undefined;
        if (targetSeat?.teamId === sender.teamId) target.emit("teamSignal", event);
      }
    });

    socket.on("hostCommand", (payload, acknowledge) => {
      if (!payload || payload.token !== hostToken || !isHostCommand(payload.command)) {
        sendAcknowledgement(acknowledge, invalid("主机权限无效"));
        return;
      }
      const entry = activeEntry();
      const result = runHostCommand(entry.room, payload.command);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        if (payload.command === "start") startDiagnostics(entry);
        else if (payload.command === "end") finishDiagnostics("forced");
        else finishDiagnostics("reset");
        broadcastEntryRoom(entry);
        broadcastEntryTransition(entry);
      }
    });

    socket.on("hostAdminCommand", (payload, acknowledge) => {
      if (!payload || typeof payload.token !== "string" || !isHostAdminCommand(payload.command)) {
        sendAcknowledgement(acknowledge, invalid("主机命令格式无效"));
        return;
      }
      const entry = activeEntry();
      const request = { remoteAddress: socket.handshake.address, token: payload.token, command: payload.command };
      const playerExists = "playerId" in payload.command && entry.room.hasPlayer(payload.command.playerId);
      const authorization = hostAdmin.authorize(request, entry.room.snapshot().phase, playerExists);
      const result = authorization.ok ? entry.room.applyHostAdminCommand(payload.command) : authorization;
      if (authorization.ok) hostAdmin.recordResult(payload.command, result);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        if (entry.room.gameSnapshot()?.phase === "finished" && activeDiagnosticsMatchId && activeDiagnosticsEntry === entry) finishDiagnostics("forced");
        broadcastEntryRoom(entry);
        broadcastEntryTransition(entry);
        setImmediate(() => disconnectKickedSockets(entry));
      }
    });

    socket.on("disconnect", () => {
      const entry = activeEntry();
      lastInputAt.delete(socket.id);
      diagnosticProfiles.delete(socket.id);
      const playerId = entry.room.playerIdForSocket(socket.id);
      if (playerId) lastTeamSignalAt.delete(playerId);
      if (playerId && activeDiagnosticsMatchId && activeDiagnosticsEntry === entry) diagnostics.recordDisconnect(playerId, diagnosticsNow());
      entry.room.disconnect(socket.id);
      socketRooms.delete(socket.id);
      directory.markActivity(entry);
      broadcastEntryRoom(entry);
      broadcastEntryTransition(entry);
      emitRoomDirectory();
    });
  });

  const advance = (deltaMs: number): void => {
    const startedAt = performance.now();
    let transitionedAny = false;
    let kickedAny = false;
    let publicTransition: GameSnapshot | null = null;
    for (const entry of directory.entries()) {
      const lifecycleBefore = entry.room.snapshot().lifecyclePhase;
      const transitioned = entry.room.tick(deltaMs);
      const kickedSocketIds = entry.room.consumeKickedSocketIds();
      for (const socketId of kickedSocketIds) io.sockets.sockets.get(socketId)?.disconnect(true);
      transitionedAny ||= transitioned;
      kickedAny ||= kickedSocketIds.length > 0;
      if (transitioned || kickedSocketIds.length > 0) {
        if (lifecycleBefore === "countdown" && entry.room.snapshot().lifecyclePhase === "playing" && !activeDiagnosticsMatchId) startDiagnostics(entry);
        broadcastEntryRoom(entry);
        const transitionSnapshot = broadcastEntryTransition(entry);
        if (entry === publicEntry) publicTransition = transitionSnapshot;
      }
    }
    simulationDuration.add(performance.now() - startedAt);
    if (transitionedAny || kickedAny) {
      if (activeDiagnosticsMatchId && publicTransition?.phase === "finished") finishDiagnostics("normal");
      else if (activeDiagnosticsMatchId && !publicTransition && !publicEntry.room.gameSnapshot()) finishDiagnostics("reset");
    }
    snapshotOpportunityMs += deltaMs;
    if (snapshotOpportunityMs >= 1_000 / SNAPSHOT_RATE) {
      snapshotOpportunityMs %= 1_000 / SNAPSHOT_RATE;
      if (!transitionedAny) broadcastVolatileSnapshots();
    }
    diagnosticWindowMs += deltaMs;
    if (diagnosticWindowMs >= 1_000) {
      const diagnosticsStartedAt = performance.now();
      diagnosticWindowMs %= 1_000;
      const timing = simulationDuration.snapshot();
      const snapshot = latestGameSnapshot;
      const catchUpLimitHits = fixedLoop.catchUpLimitHits - previousCatchUpLimitHits;
      previousCatchUpLimitHits = fixedLoop.catchUpLimitHits;
      const serverSample: ServerDiagnosticSample = {
        sampledAt: diagnosticsNow(),
        stepP95Ms: timing.p95,
        stepMaxMs: timing.max,
        steps: timing.count,
        catchUpLimitHits,
        humans: snapshot?.players.filter((player) => !player.isBot).length ?? 0,
        bots: snapshot?.players.filter((player) => player.isBot).length ?? 0,
        projectiles: snapshot?.projectiles.length ?? 0,
        skillEffects: snapshot?.players.filter((player) => player.exclusiveSkillState != null).length ?? 0,
        acceptedSamples: acceptedDiagnosticSamples,
        rejectedSamples: rejectedDiagnosticSamples,
      };
      diagnostics.recordServerSample(serverSample);
      simulationDuration.clear();
      acceptedDiagnosticSamples = 0;
      rejectedDiagnosticSamples = 0;
      emitDiagnosticsSnapshot(serverSample.sampledAt);
      diagnosticsDuration.add(performance.now() - diagnosticsStartedAt);
    }
  };

  const poll = (nowMs: number): number => fixedLoop.advance(nowMs, advance);

  const interval = options.autoPoll === false ? null : setInterval(() => {
    poll(performance.now());
  }, 4);
  interval?.unref();

  return {
    io,
    advance,
    poll,
    diagnosticsTiming: () => diagnosticsDuration.snapshot(),
    close: async () => {
      if (interval) clearInterval(interval);
      finishDiagnostics("shutdown");
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

export function advanceSnapshotDeadline(
  currentDeadline: number,
  serverTime: number,
  snapshotRate: 20 | 30,
): number {
  const intervalMs = 1_000 / snapshotRate;
  const baseDeadline = Number.isFinite(currentDeadline) && currentDeadline > 0
    ? currentDeadline
    : serverTime;
  if (baseDeadline > serverTime + SNAPSHOT_DEADLINE_EPSILON_MS) return baseDeadline;
  const missedIntervals = Math.floor(
    (serverTime + SNAPSHOT_DEADLINE_EPSILON_MS - baseDeadline) / intervalMs,
  ) + 1;
  return baseDeadline + missedIntervals * intervalMs;
}

function runHostCommand(room: GameRoom, command: HostCommand): Ack {
  switch (command) {
    case "start":
      return room.startMatch();
    case "startCountdown":
      return room.startMatch({ countdown: true });
    case "end":
      return room.endMatch();
    case "reset":
      return room.resetToLobby();
  }
}

function isHostCommand(command: unknown): command is HostCommand {
  return command === "start" || command === "startCountdown" || command === "end" || command === "reset";
}

function isJoinPayload(payload: unknown): payload is JoinPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<JoinPayload>;
  return typeof candidate.nickname === "string"
    && isCharacterId(candidate.characterId)
    && (candidate.tacticalModuleId === undefined || isTacticalModuleId(candidate.tacticalModuleId));
}

function isPlayerInput(input: unknown): input is PlayerInput {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<PlayerInput>;
  return (
    Number.isSafeInteger(candidate.seq) &&
    candidate.seq! >= 0 &&
    Number.isFinite(candidate.moveX) &&
    Number.isFinite(candidate.moveY) &&
    Number.isFinite(candidate.aimX) &&
    Number.isFinite(candidate.aimY) &&
    typeof candidate.firing === "boolean"
  );
}

function isHostAdminCommand(command: unknown): command is HostAdminCommand {
  if (!command || typeof command !== "object") return false;
  const candidate = command as Record<string, unknown>;
  if (candidate.type === "setMode") return isMatchMode(candidate.mode);
  if (candidate.type === "setMap") return candidate.mapSelection === "random" || MAP_CATALOG.some((map) => map.id === candidate.mapSelection);
  if (candidate.type === "setMapMechanics") return typeof candidate.enabled === "boolean";
  if (candidate.type === "setMapEvents") return typeof candidate.enabled === "boolean";
  if (candidate.type === "setBotDifficulty") return isBotDifficulty(candidate.difficulty);
  if (candidate.type === "setEliminationRules") return normalizeEliminationRules(candidate.rules as never).ok;
  if (candidate.type === "applyRoomPreset") return normalizeRoomPreset(candidate.preset).ok;
  if (candidate.type === "swapTeams") return typeof candidate.firstPlayerId === "string" && typeof candidate.secondPlayerId === "string";
  if (candidate.type === "forceTeamWinner") return TEAM_IDS.includes(candidate.teamId as never);
  if (typeof candidate.playerId !== "string") return false;
  if (candidate.type === "kick" || candidate.type === "forceWinner") return true;
  return candidate.type === "setStat" &&
    ["health", "maxHealth", "damage", "score", "moveSpeed", "fireCooldownMs", "projectileSpeed", "kills", "energyCollected", "exclusiveSkillCooldownMs"].includes(String(candidate.stat)) &&
    Number.isFinite(candidate.value);
}

function isUseSkillPayload(payload: unknown): payload is UseSkillPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<UseSkillPayload>;
  return Number.isSafeInteger(candidate.skillActionSeq) && candidate.skillActionSeq! >= 0;
}

function isUseExclusiveSkillPayload(payload: unknown): payload is UseExclusiveSkillPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<UseExclusiveSkillPayload>;
  return Number.isSafeInteger(candidate.skillActionSeq) && candidate.skillActionSeq! >= 0 && Number.isFinite(candidate.directionX) && Number.isFinite(candidate.directionY);
}

function isTeamSignalPayload(payload: unknown): payload is TeamSignalPayload {
  if (!payload || typeof payload !== "object") return false;
  return TEAM_SIGNAL_KINDS.includes((payload as Partial<TeamSignalPayload>).kind as never);
}

function isTeamMatchMode(mode: GameSnapshot["matchMode"]): boolean {
  return mode === "team3v3" || mode === "team2v2v2" || mode === "domination3v3" || mode === "domination2v2v2" || mode === "teamElimination3v3";
}

function isPerformanceHint(hint: unknown): hint is PerformanceHint {
  if (!hint || typeof hint !== "object") return false;
  const candidate = hint as Partial<PerformanceHint>;
  return (
    (candidate.snapshotMode === "full" || candidate.snapshotMode === "reduced") &&
    Number.isFinite(candidate.frameP95Ms) &&
    candidate.frameP95Ms! >= 0 &&
    candidate.frameP95Ms! <= 1_000
  );
}

function invalid<T = undefined>(error: string): Ack<T> {
  return { ok: false, error };
}

function sendAcknowledgement<T>(callback: ((result: Ack<T>) => void) | undefined, result: Ack<T>): void {
  if (typeof callback === "function") callback(result);
}

export function isAllowedLanOrigin(origin: string | undefined, allowedLanAddresses: readonly string[] = []): boolean {
  if (!origin) return true;
  try {
    const parsedHostname = new URL(origin).hostname.toLowerCase();
    const hostname = parsedHostname.startsWith("[") && parsedHostname.endsWith("]")
      ? parsedHostname.slice(1, -1)
      : parsedHostname;
    if (hostname === "localhost" || hostname === "::1") return true;
    if (isIP(hostname) !== 4) return false;
    if (allowedLanAddresses.includes(hostname)) return true;

    const [first, second = Number.NaN] = hostname.split(".").map(Number);
    return first === 127 || first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
  } catch {
    return false;
  }
}
