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
} from "../shared/protocol";
import { isCharacterId } from "../shared/character-catalog";
import { isMatchMode, TEAM_IDS } from "../shared/mode-catalog";
import { MAP_CATALOG } from "../shared/map-catalog";
import { GameRoom } from "./room";
import { FixedStepAccumulator } from "./fixed-loop";
import { RollingMetric } from "./performance";
import { authorizeHostAccess, HostAdminService } from "./host-admin";
import { DiagnosticsSession } from "./diagnostics-session";
import { maskNetworkAddress } from "./network-address";

interface InterServerEvents {}
const SNAPSHOT_DEADLINE_EPSILON_MS = 1e-6;

interface SocketData {
  snapshotRate: 20 | 30;
  nextSnapshotAt: number;
  lastDiagnosticsAt: number;
  hostDiagnosticsAuthorized: boolean;
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
  let latestGameSnapshot: GameSnapshot | null = null;

  const broadcastRoom = () => io.emit("roomState", room.snapshot());
  const broadcastGame = () => {
    const snapshot = room.gameSnapshot();
    latestGameSnapshot = snapshot;
    if (snapshot) io.emit("gameState", snapshot);
  };
  const broadcastGameTransition = () => {
    latestGameSnapshot = room.gameSnapshot();
    io.emit("gameState", latestGameSnapshot);
    return latestGameSnapshot;
  };
  const emitDiagnosticsSnapshot = (now = diagnosticsNow()) => io.to("host-diagnostics").emit("hostDiagnostics", diagnostics.snapshot(now));
  const finishDiagnostics = (reason: DiagnosticEndReason) => {
    if (!activeDiagnosticsMatchId) return;
    const report = diagnostics.finish(diagnosticsNow(), reason);
    activeDiagnosticsMatchId = null;
    io.emit("diagnosticsSession", { matchId: null });
    if (report) io.to("host-diagnostics").emit("diagnosticReport", report);
  };
  const startDiagnostics = (reasonIfAlreadyFinished: DiagnosticEndReason = "forced") => {
    const game = room.gameSnapshot();
    const roomSnapshot = room.snapshot();
    if (!game?.mapId || !roomSnapshot.matchMode) return;
    const matchId = randomUUID();
    diagnostics.start({
      matchId,
      mapId: game.mapId,
      matchMode: roomSnapshot.matchMode,
      startedAt: diagnosticsNow(),
      players: game.players.filter((player) => !player.isBot).map((player) => {
        const playerSocket = [...io.sockets.sockets.values()].find((candidate) => room.playerIdForSocket(candidate.id) === player.id);
        return {
          playerId: player.id,
          nickname: player.nickname,
          characterId: player.characterId,
          address: maskNetworkAddress(playerSocket?.handshake.address),
        };
      }),
    });
    activeDiagnosticsMatchId = matchId;
    for (const socket of io.sockets.sockets.values()) {
      const playerId = room.playerIdForSocket(socket.id);
      const profile = diagnosticProfiles.get(socket.id);
      if (playerId && profile) diagnostics.setProfile(playerId, profile, maskNetworkAddress(socket.handshake.address));
    }
    io.emit("diagnosticsSession", { matchId });
    emitDiagnosticsSnapshot();
    if (game.phase === "finished") finishDiagnostics(reasonIfAlreadyFinished);
  };
  const disconnectKickedSockets = () => {
    for (const socketId of room.consumeKickedSocketIds()) {
      io.sockets.sockets.get(socketId)?.disconnect(true);
    }
  };
  const revokeHostDiagnostics = (socket: GameSocket) => {
    if (!socket.data.hostDiagnosticsAuthorized) return;
    socket.data.hostDiagnosticsAuthorized = false;
    void socket.leave("host-diagnostics");
  };
  const broadcastVolatileSnapshots = () => {
    const snapshot = room.gameSnapshot();
    latestGameSnapshot = snapshot;
    if (!snapshot) return;
    for (const socket of io.sockets.sockets.values()) {
      if (snapshot.serverTime + SNAPSHOT_DEADLINE_EPSILON_MS < socket.data.nextSnapshotAt) continue;
      socket.volatile.emit("gameState", snapshot);
      socket.data.nextSnapshotAt = advanceSnapshotDeadline(
        socket.data.nextSnapshotAt,
        snapshot.serverTime,
        socket.data.snapshotRate,
      );
    }
  };

  io.on("connection", (socket) => {
    socket.data.snapshotRate = SNAPSHOT_RATE;
    socket.data.nextSnapshotAt = 0;
    socket.data.lastDiagnosticsAt = Number.NEGATIVE_INFINITY;
    socket.data.hostDiagnosticsAuthorized = false;
    socket.emit("roomState", room.snapshot());
    const currentGame = room.gameSnapshot();
    latestGameSnapshot = currentGame;
    if (currentGame) socket.emit("gameState", currentGame);
    socket.emit("diagnosticsSession", { matchId: activeDiagnosticsMatchId });

    socket.on("join", (payload, acknowledge) => {
      const result = isJoinPayload(payload) ? room.joinHuman(socket.id, payload) : invalid<import("../shared/protocol").JoinResult>("加入信息格式不正确");
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        revokeHostDiagnostics(socket);
        broadcastRoom();
      }
    });

    socket.on("changeCharacter", (characterId, acknowledge) => {
      const result = isCharacterId(characterId)
        ? room.changeCharacter(socket.id, characterId)
        : invalid("请选择有效角色");
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        revokeHostDiagnostics(socket);
        broadcastRoom();
      }
    });

    socket.on("reconnectPlayer", (payload, acknowledge) => {
      const result = payload && typeof payload.token === "string"
        ? room.reconnectHuman(socket.id, payload.token)
        : invalid<import("../shared/protocol").JoinResult>("重连信息格式不正确");
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        revokeHostDiagnostics(socket);
        broadcastRoom();
        broadcastGameTransition();
        const playerId = room.playerIdForSocket(socket.id);
        if (playerId && activeDiagnosticsMatchId) diagnostics.recordReconnect(playerId, diagnosticsNow());
      }
    });

    socket.on("setReady", (ready, acknowledge) => {
      const result = room.setReady(socket.id, ready === true);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) broadcastRoom();
    });

    socket.on("returnToLobby", (acknowledge) => {
      const result = room.returnToLobby(socket.id);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        broadcastRoom();
        broadcastGameTransition();
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
      const playerId = room.playerIdForSocket(socket.id);
      if (playerId && activeDiagnosticsMatchId) diagnostics.setProfile(playerId, sanitizedProfile, maskNetworkAddress(socket.handshake.address));
    });

    socket.on("diagnosticsSample", (sample) => {
      const diagnosticsStartedAt = performance.now();
      const now = diagnosticsNow();
      const playerId = room.playerIdForSocket(socket.id);
      const sanitizedSample = isDiagnosticPayloadWithinLimit(sample) ? sanitizeClientDiagnosticSample(sample) : null;
      if (!playerId || !sanitizedSample || sanitizedSample.matchId !== activeDiagnosticsMatchId || now - socket.data.lastDiagnosticsAt < 750) {
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
      const access = payload && typeof payload.token === "string"
        ? authorizeHostAccess(socket.handshake.address, payload.token, hostToken)
        : invalid("房主权限无效");
      const result = access.ok && room.playerIdForSocket(socket.id)
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
      room.handleInput(socket.id, input);
    });

    socket.on("useSkill", (payload) => {
      if (isUseSkillPayload(payload)) room.handleSkillAction(socket.id, payload);
    });

    socket.on("useExclusiveSkill", (payload) => {
      if (isUseExclusiveSkillPayload(payload)) room.handleExclusiveSkillAction(socket.id, payload);
    });

    socket.on("hostCommand", (payload, acknowledge) => {
      if (!payload || payload.token !== hostToken || !isHostCommand(payload.command)) {
        sendAcknowledgement(acknowledge, invalid("主机权限无效"));
        return;
      }
      const result = runHostCommand(room, payload.command);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        if (payload.command === "start") startDiagnostics();
        else if (payload.command === "end") finishDiagnostics("forced");
        else finishDiagnostics("reset");
        broadcastRoom();
        broadcastGameTransition();
      }
    });

    socket.on("hostAdminCommand", (payload, acknowledge) => {
      if (!payload || typeof payload.token !== "string" || !isHostAdminCommand(payload.command)) {
        sendAcknowledgement(acknowledge, invalid("主机命令格式无效"));
        return;
      }
      const request = { remoteAddress: socket.handshake.address, token: payload.token, command: payload.command };
      const playerExists = "playerId" in payload.command && room.hasPlayer(payload.command.playerId);
      const authorization = hostAdmin.authorize(request, room.snapshot().phase, playerExists);
      const result = authorization.ok ? room.applyHostAdminCommand(payload.command) : authorization;
      if (authorization.ok) hostAdmin.recordResult(payload.command, result);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        if (room.gameSnapshot()?.phase === "finished" && activeDiagnosticsMatchId) finishDiagnostics("forced");
        broadcastRoom();
        broadcastGameTransition();
        setImmediate(disconnectKickedSockets);
      }
    });

    socket.on("disconnect", () => {
      lastInputAt.delete(socket.id);
      diagnosticProfiles.delete(socket.id);
      const playerId = room.playerIdForSocket(socket.id);
      if (playerId && activeDiagnosticsMatchId) diagnostics.recordDisconnect(playerId, diagnosticsNow());
      room.disconnect(socket.id);
      broadcastRoom();
      broadcastGame();
    });
  });

  const advance = (deltaMs: number): void => {
    const startedAt = performance.now();
    const transitioned = room.tick(deltaMs);
    const kickedSocketIds = room.consumeKickedSocketIds();
    for (const socketId of kickedSocketIds) io.sockets.sockets.get(socketId)?.disconnect(true);
    simulationDuration.add(performance.now() - startedAt);
    if (transitioned || kickedSocketIds.length > 0) {
      broadcastRoom();
      const transitionSnapshot = broadcastGameTransition();
      if (activeDiagnosticsMatchId && transitionSnapshot?.phase === "finished") finishDiagnostics("normal");
      else if (activeDiagnosticsMatchId && !transitionSnapshot) finishDiagnostics("reset");
    }
    snapshotOpportunityMs += deltaMs;
    if (snapshotOpportunityMs >= 1_000 / SNAPSHOT_RATE) {
      snapshotOpportunityMs %= 1_000 / SNAPSHOT_RATE;
      if (!transitioned) broadcastVolatileSnapshots();
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
    case "end":
      return room.endMatch();
    case "reset":
      return room.resetToLobby();
  }
}

function isHostCommand(command: unknown): command is HostCommand {
  return command === "start" || command === "end" || command === "reset";
}

function isJoinPayload(payload: unknown): payload is JoinPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<JoinPayload>;
  return typeof candidate.nickname === "string" && isCharacterId(candidate.characterId);
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
