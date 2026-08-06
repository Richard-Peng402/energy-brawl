import type { Server as HttpServer } from "node:http";
import { isIP } from "node:net";

import { Server } from "socket.io";

import { performance } from "node:perf_hooks";

import { REDUCED_SNAPSHOT_RATE, SERVER_TICK_MS, SNAPSHOT_RATE } from "../shared/constants";
import type {
  Ack,
  ClientToServerEvents,
  HostAdminCommand,
  HostCommand,
  JoinPayload,
  PerformanceHint,
  PlayerInput,
  ServerToClientEvents,
  UseSkillPayload,
} from "../shared/protocol";
import { isCharacterId } from "../shared/character-catalog";
import { GameRoom } from "./room";
import { FixedStepAccumulator } from "./fixed-loop";
import { RollingMetric } from "./performance";
import { HostAdminService } from "./host-admin";

interface InterServerEvents {}
const SNAPSHOT_DEADLINE_EPSILON_MS = 1e-6;

interface SocketData {
  snapshotRate: 20 | 30;
  nextSnapshotAt: number;
}

export interface GameNetwork {
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  advance: (deltaMs: number) => void;
  poll: (nowMs: number) => number;
  close: () => Promise<void>;
}

export function attachGameNetwork(httpServer: HttpServer, room: GameRoom, hostToken: string): GameNetwork {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: { origin: true, credentials: false },
    allowRequest: (request, callback) => callback(null, isAllowedLanOrigin(request.headers.origin)),
    transports: ["websocket", "polling"],
  });
  const lastInputAt = new Map<string, number>();
  const fixedLoop = new FixedStepAccumulator(SERVER_TICK_MS, 3);
  const simulationDuration = new RollingMetric();
  const hostAdmin = new HostAdminService(hostToken);
  room.attachHostAdmin(hostAdmin);
  let snapshotOpportunityMs = 0;

  const broadcastRoom = () => io.emit("roomState", room.snapshot());
  const broadcastGame = () => {
    const snapshot = room.gameSnapshot();
    if (snapshot) io.emit("gameState", snapshot);
  };
  const broadcastGameTransition = () => io.emit("gameState", room.gameSnapshot());
  const broadcastVolatileSnapshots = () => {
    const snapshot = room.gameSnapshot();
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
    socket.emit("roomState", room.snapshot());
    const currentGame = room.gameSnapshot();
    if (currentGame) socket.emit("gameState", currentGame);

    socket.on("join", (payload, acknowledge) => {
      const result = isJoinPayload(payload) ? room.joinHuman(socket.id, payload) : invalid<import("../shared/protocol").JoinResult>("加入信息格式不正确");
      sendAcknowledgement(acknowledge, result);
      if (result.ok) broadcastRoom();
    });

    socket.on("reconnectPlayer", (payload, acknowledge) => {
      const result = payload && typeof payload.token === "string"
        ? room.reconnectHuman(socket.id, payload.token)
        : invalid<import("../shared/protocol").JoinResult>("重连信息格式不正确");
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        broadcastRoom();
        broadcastGameTransition();
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

    socket.on("playerInput", (input) => {
      const now = Date.now();
      if (now - (lastInputAt.get(socket.id) ?? 0) < 15 || !isPlayerInput(input)) return;
      lastInputAt.set(socket.id, now);
      room.handleInput(socket.id, input);
    });

    socket.on("useSkill", (payload) => {
      if (isUseSkillPayload(payload)) room.handleSkillAction(socket.id, payload);
    });

    socket.on("hostCommand", (payload, acknowledge) => {
      if (!payload || payload.token !== hostToken || !isHostCommand(payload.command)) {
        sendAcknowledgement(acknowledge, invalid("主机权限无效"));
        return;
      }
      const result = runHostCommand(room, payload.command);
      sendAcknowledgement(acknowledge, result);
      if (result.ok) {
        broadcastRoom();
        broadcastGameTransition();
      }
    });

    socket.on("hostAdminCommand", (payload, acknowledge) => {
      const result = payload && typeof payload.token === "string" && isHostAdminCommand(payload.command)
        ? hostAdmin.enqueue({ remoteAddress: socket.handshake.address, token: payload.token, command: payload.command }, room.gameWorld())
        : invalid("主机命令格式无效");
      sendAcknowledgement(acknowledge, result);
    });

    socket.on("disconnect", () => {
      lastInputAt.delete(socket.id);
      room.disconnect(socket.id);
      broadcastRoom();
      broadcastGame();
    });
  });

  const advance = (deltaMs: number): void => {
    const startedAt = performance.now();
    const transitioned = room.tick(deltaMs);
    const kickedSocketIds = room.consumeKickedSocketIds();
    for (const socketId of kickedSocketIds) {
      io.sockets.sockets.get(socketId)?.disconnect(true);
    }
    simulationDuration.add(performance.now() - startedAt);
    if (transitioned || kickedSocketIds.length > 0) {
      broadcastRoom();
      broadcastGameTransition();
    }
    snapshotOpportunityMs += deltaMs;
    if (snapshotOpportunityMs >= 1_000 / SNAPSHOT_RATE) {
      snapshotOpportunityMs %= 1_000 / SNAPSHOT_RATE;
      if (!transitioned) broadcastVolatileSnapshots();
    }
  };

  const poll = (nowMs: number): number => fixedLoop.advance(nowMs, advance);

  const interval = setInterval(() => {
    poll(performance.now());
  }, 4);
  interval.unref();

  return {
    io,
    advance,
    poll,
    close: async () => {
      clearInterval(interval);
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
  const candidate = command as Partial<HostAdminCommand> & { stat?: unknown; value?: unknown };
  if (typeof candidate.playerId !== "string") return false;
  if (candidate.type === "kick" || candidate.type === "forceWinner") return true;
  return candidate.type === "setStat" &&
    ["health", "maxHealth", "damage", "score", "moveSpeed", "fireCooldownMs"].includes(String(candidate.stat)) &&
    Number.isFinite(candidate.value);
}

function isUseSkillPayload(payload: unknown): payload is UseSkillPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<UseSkillPayload>;
  return Number.isSafeInteger(candidate.skillActionSeq) && candidate.skillActionSeq! >= 0;
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

export function isAllowedLanOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const parsedHostname = new URL(origin).hostname.toLowerCase();
    const hostname = parsedHostname.startsWith("[") && parsedHostname.endsWith("]")
      ? parsedHostname.slice(1, -1)
      : parsedHostname;
    if (hostname === "localhost" || hostname === "::1") return true;
    if (isIP(hostname) !== 4) return false;

    const [first, second = Number.NaN] = hostname.split(".").map(Number);
    return first === 127 || first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
  } catch {
    return false;
  }
}
