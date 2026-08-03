import type { Server as HttpServer } from "node:http";

import { Server } from "socket.io";

import { SERVER_TICK_MS, SNAPSHOT_RATE } from "../shared/constants";
import type {
  Ack,
  ClientToServerEvents,
  HostCommand,
  JoinPayload,
  PlayerInput,
  ServerToClientEvents,
} from "../shared/protocol";
import { GameRoom } from "./room";

interface InterServerEvents {}
interface SocketData {}

export interface GameNetwork {
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  close: () => Promise<void>;
}

export function attachGameNetwork(httpServer: HttpServer, room: GameRoom, hostToken: string): GameNetwork {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: { origin: true, credentials: false },
    transports: ["websocket", "polling"],
  });
  const lastInputAt = new Map<string, number>();
  let snapshotAccumulator = 0;

  const broadcastRoom = () => io.emit("roomState", room.snapshot());
  const broadcastGame = () => {
    const snapshot = room.gameSnapshot();
    if (snapshot) io.emit("gameState", snapshot);
  };

  io.on("connection", (socket) => {
    socket.emit("roomState", room.snapshot());
    const currentGame = room.gameSnapshot();
    if (currentGame) socket.emit("gameState", currentGame);

    socket.on("join", (payload, acknowledge) => {
      const result = isJoinPayload(payload) ? room.joinHuman(socket.id, payload) : invalid<import("../shared/protocol").JoinResult>("加入信息格式不正确");
      acknowledge(result);
      if (result.ok) broadcastRoom();
    });

    socket.on("reconnectPlayer", (payload, acknowledge) => {
      const result = payload && typeof payload.token === "string"
        ? room.reconnectHuman(socket.id, payload.token)
        : invalid<import("../shared/protocol").JoinResult>("重连信息格式不正确");
      acknowledge(result);
      if (result.ok) {
        broadcastRoom();
        broadcastGame();
      }
    });

    socket.on("setReady", (ready, acknowledge) => {
      const result = room.setReady(socket.id, ready === true);
      acknowledge(result);
      if (result.ok) broadcastRoom();
    });

    socket.on("playerInput", (input) => {
      const now = Date.now();
      if (now - (lastInputAt.get(socket.id) ?? 0) < 15 || !isPlayerInput(input)) return;
      lastInputAt.set(socket.id, now);
      room.handleInput(socket.id, input);
    });

    socket.on("hostCommand", (payload, acknowledge) => {
      if (!payload || payload.token !== hostToken || !isHostCommand(payload.command)) {
        acknowledge(invalid("主机权限无效"));
        return;
      }
      const result = runHostCommand(room, payload.command);
      acknowledge(result);
      if (result.ok) {
        broadcastRoom();
        broadcastGame();
      }
    });

    socket.on("disconnect", () => {
      lastInputAt.delete(socket.id);
      room.disconnect(socket.id);
      broadcastRoom();
      broadcastGame();
    });
  });

  const interval = setInterval(() => {
    room.tick(SERVER_TICK_MS);
    snapshotAccumulator += SERVER_TICK_MS;
    if (snapshotAccumulator >= 1_000 / SNAPSHOT_RATE) {
      snapshotAccumulator = 0;
      broadcastGame();
    }
  }, SERVER_TICK_MS);
  interval.unref();

  return {
    io,
    close: async () => {
      clearInterval(interval);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
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
  return typeof candidate.nickname === "string" && typeof candidate.color === "string";
}

function isPlayerInput(input: unknown): input is PlayerInput {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<PlayerInput>;
  return (
    Number.isFinite(candidate.seq) &&
    Number.isFinite(candidate.moveX) &&
    Number.isFinite(candidate.moveY) &&
    Number.isFinite(candidate.aimX) &&
    Number.isFinite(candidate.aimY) &&
    typeof candidate.firing === "boolean"
  );
}

function invalid<T = undefined>(error: string): Ack<T> {
  return { ok: false, error };
}
