import { timingSafeEqual } from "node:crypto";

import type { Ack, AdminStat, GamePhase, HostAdminCommand } from "../shared/protocol";

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
}

const MAX_LOGS = 200;
const STAT_RANGES: Readonly<Record<AdminStat, readonly [number, number]>> = {
  health: [1, 500],
  maxHealth: [1, 500],
  damage: [0, 200],
  score: [0, 99],
  moveSpeed: [50, 600],
  fireCooldownMs: [100, 2_000],
  projectileSpeed: [100, 2_000],
  kills: [0, 99],
  energyCollected: [0, 999],
};

export class HostAdminService {
  private readonly logs: HostAdminLog[] = [];

  constructor(private readonly token: string, private readonly now: () => number = Date.now) {}

  authorize(request: HostAdminRequest, phase: GamePhase, playerExists: boolean): Ack {
    const error = this.validate(request, phase, playerExists);
    if (error) {
      this.record({ timestamp: this.now(), command: request.command, result: "rejected", detail: error });
      return { ok: false, error };
    }
    return { ok: true };
  }

  recordResult(command: HostAdminCommand, result: Ack): void {
    this.record({
      timestamp: this.now(),
      command: structuredClone(command),
      result: result.ok ? "applied" : "rejected",
      detail: result.ok ? "ok" : result.error ?? "状态未改变",
    });
  }

  getLogs(): readonly HostAdminLog[] {
    return [...this.logs];
  }

  private validate(request: HostAdminRequest, phase: GamePhase, playerExists: boolean): string | null {
    if (!isLoopbackAddress(request.remoteAddress)) return "房主命令只允许本机调用";
    if (!safeTokenEqual(request.token, this.token)) return "房主权限无效";
    if (phase === "finished") return "当前阶段不可执行";
    if (!request.command || typeof request.command !== "object") return "命令格式无效";
    if (typeof request.command.playerId !== "string" || !playerExists) return "目标玩家不存在";
    if (request.command.type === "setStat") {
      if (!(request.command.stat in STAT_RANGES) || !Number.isFinite(request.command.value)) return "数值命令无效";
      const [minimum, maximum] = STAT_RANGES[request.command.stat];
      if (request.command.value < minimum || request.command.value > maximum) return "数值超出安全范围";
    } else if (request.command.type !== "kick" && request.command.type !== "forceWinner") {
      return "命令类型无效";
    }
    return null;
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
