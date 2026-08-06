import { timingSafeEqual } from "node:crypto";

import type { Ack, AdminStat, HostAdminCommand } from "../shared/protocol";
import { refreshWorldScoreState, type GameWorld } from "./simulation";

export interface HostAdminRequest {
  remoteAddress: string | undefined;
  token: string;
  command: HostAdminCommand;
}

export interface HostAdminLog {
  timestamp: number;
  command: HostAdminCommand;
  result: "applied" | "rejected";
  detail: string;
  before?: number;
  after?: number;
}

const MAX_QUEUE = 128;
const MAX_LOGS = 200;
const STAT_RANGES: Readonly<Record<AdminStat, readonly [number, number]>> = {
  health: [1, 500],
  maxHealth: [1, 500],
  damage: [0, 200],
  score: [0, 99],
  moveSpeed: [50, 600],
  fireCooldownMs: [100, 2_000],
};

export class HostAdminService {
  private readonly queue: HostAdminCommand[] = [];
  private readonly logs: HostAdminLog[] = [];

  constructor(private readonly token: string, private readonly now: () => number = Date.now) {}

  enqueue(request: HostAdminRequest, world: GameWorld | null): Ack {
    const error = this.validate(request, world);
    if (error) {
      this.record({ timestamp: this.now(), command: request.command, result: "rejected", detail: error });
      return { ok: false, error };
    }
    this.queue.push(structuredClone(request.command));
    return { ok: true };
  }

  drain(world: GameWorld, handleOther?: (command: Exclude<HostAdminCommand, { type: "setStat" }>) => boolean): number {
    const pending = this.queue.splice(0);
    for (const command of pending) {
      if (command.type === "setStat") this.applyStat(world, command);
      else {
        const applied = handleOther?.(command) === true;
        this.record({ timestamp: this.now(), command, result: applied ? "applied" : "rejected", detail: applied ? "ok" : "unsupported" });
      }
    }
    return pending.length;
  }

  getLogs(): readonly HostAdminLog[] {
    return [...this.logs];
  }

  private validate(request: HostAdminRequest, world: GameWorld | null): string | null {
    if (!isLoopbackAddress(request.remoteAddress)) return "主机命令只允许本机调用";
    if (!safeTokenEqual(request.token, this.token)) return "主机权限无效";
    if (!world || world.phase === "finished") return "当前阶段不可执行";
    if (this.queue.length >= MAX_QUEUE) return "主机命令队列已满";
    if (!request.command || typeof request.command !== "object") return "命令格式无效";
    const playerId = request.command.playerId;
    if (typeof playerId !== "string" || !world.players.has(playerId)) return "目标玩家不存在";
    if (request.command.type === "setStat") {
      if (!(request.command.stat in STAT_RANGES) || !Number.isFinite(request.command.value)) return "数值命令无效";
      const [minimum, maximum] = STAT_RANGES[request.command.stat];
      if (request.command.value < minimum || request.command.value > maximum) return "数值超出安全范围";
    } else if (request.command.type !== "kick" && request.command.type !== "forceWinner") {
      return "命令类型无效";
    }
    return null;
  }

  private applyStat(world: GameWorld, command: Extract<HostAdminCommand, { type: "setStat" }>): void {
    const player = world.players.get(command.playerId);
    if (!player) return;
    const before = player[command.stat];
    switch (command.stat) {
      case "health":
        player.health = Math.min(player.maxHealth, command.value);
        break;
      case "maxHealth":
        player.maxHealth = command.value;
        player.health = Math.min(player.health, player.maxHealth);
        break;
      case "damage": player.damage = command.value; break;
      case "score":
        player.score = command.value;
        refreshWorldScoreState(world, player.id);
        break;
      case "moveSpeed": player.moveSpeed = command.value; break;
      case "fireCooldownMs": player.fireCooldownMs = command.value; break;
    }
    const after = player[command.stat];
    this.record({ timestamp: this.now(), command, result: "applied", detail: "ok", before, after });
  }

  private record(log: HostAdminLog): void {
    this.logs.push(log);
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
  }
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "::1" || normalized === "127.0.0.1" || normalized === "::ffff:127.0.0.1";
}

function safeTokenEqual(actual: string, expected: string): boolean {
  if (typeof actual !== "string" || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
