import { timingSafeEqual } from "node:crypto";

import { MAX_EXCLUSIVE_SKILL_COOLDOWN_MS, MIN_EXCLUSIVE_SKILL_COOLDOWN_MS } from "../shared/constants";
import { isMatchMode, TEAM_IDS } from "../shared/mode-catalog";
import { MAP_CATALOG, resolveMapSelection } from "../shared/map-catalog";
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
  exclusiveSkillCooldownMs: [MIN_EXCLUSIVE_SKILL_COOLDOWN_MS, MAX_EXCLUSIVE_SKILL_COOLDOWN_MS],
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
    const access = authorizeHostAccess(request.remoteAddress, request.token, this.token);
    if (!access.ok) return access.error ?? "房主权限无效";
    if (phase === "finished") return "当前阶段不可执行";
    if (!request.command || typeof request.command !== "object") return "命令格式无效";
    if (request.command.type === "setMode") {
      if (phase !== "lobby") return "只能在大厅修改模式";
      return isMatchMode(request.command.mode) ? null : "模式无效";
    }
    if (request.command.type === "setMap") {
      if (phase !== "lobby") return "只能在大厅修改地图";
      const mapSelection = (request.command as Extract<HostAdminCommand, { type: "setMap" }>).mapSelection;
      return resolveMapSelection(mapSelection).id && (mapSelection === "random" || MAP_CATALOG.some((map) => map.id === mapSelection)) ? null : "地图无效";
    }
    if (request.command.type === "setMapMechanics") {
      if (phase !== "lobby") return "只能在大厅修改动态地图机制";
      return typeof request.command.enabled === "boolean" ? null : "动态地图机制开关无效";
    }
    if (request.command.type === "swapTeams") {
      if (phase !== "lobby") return "只能在大厅调整队伍";
      if (typeof request.command.firstPlayerId !== "string" || typeof request.command.secondPlayerId !== "string" || request.command.firstPlayerId === request.command.secondPlayerId) return "队伍交换目标无效";
      return null;
    }
    if (request.command.type === "forceTeamWinner") {
      return TEAM_IDS.includes(request.command.teamId) ? null : "目标队伍无效";
    }
    if (!("playerId" in request.command)) return "命令尚未接入";
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

export function authorizeHostAccess(remoteAddress: string | undefined, actualToken: string, expectedToken: string): Ack {
  if (!isLoopbackAddress(remoteAddress)) return { ok: false, error: "房主命令只允许本机调用" };
  if (!safeTokenEqual(actualToken, expectedToken)) return { ok: false, error: "房主权限无效" };
  return { ok: true };
}

function safeTokenEqual(actual: string, expected: string): boolean {
  if (typeof actual !== "string" || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
