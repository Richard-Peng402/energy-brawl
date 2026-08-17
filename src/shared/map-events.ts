import type { Vec2 } from "./protocol";

export type MapEventKind = "supply-drop" | "area-lockdown" | "global-scan" | "energy-storm";
export type MapEventPhase = "idle" | "warning" | "active" | "cooldown";

export type MapEventZone =
  | { kind: "circle"; x: number; y: number; radius: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number };

export interface MapEventDefinition {
  kind: MapEventKind;
  name: string;
  summary: string;
  counterplay: string;
  warningMs: number;
  activeMs: number;
  cooldownMs: number;
}

export interface MapEventParticipantSnapshot {
  playerId: string;
  progress?: number;
  revealed?: boolean;
  graceUntil?: number;
}

export interface MapEventSnapshot {
  eventSeq: number;
  kind: MapEventKind;
  phase: MapEventPhase;
  round: number;
  zone: MapEventZone | null;
  point: Vec2 | null;
  phaseStartedAt: number;
  phaseEndsAt: number;
  participants: readonly MapEventParticipantSnapshot[];
}

export const MAP_EVENT_DEFINITIONS = [
  {
    kind: "supply-drop",
    name: "限时补给",
    summary: "补给核心短暂降落，持续占领后恢复生命并补充普通技能。",
    counterplay: "抢先占位、用伤害打断占领，或放弃补给换取地图目标。",
    warningMs: 4_000,
    activeMs: 10_000,
    cooldownMs: 24_000,
  },
  {
    kind: "area-lockdown",
    name: "区域封锁",
    summary: "一条交通区域进入软封锁，宽限结束后施加减速和低频伤害。",
    counterplay: "预警期撤离并切换路线，也可利用两秒宽限快速穿过。",
    warningMs: 4_000,
    activeMs: 8_000,
    cooldownMs: 24_000,
  },
  {
    kind: "global-scan",
    name: "全图扫描",
    summary: "扫描脉冲公开近期移动或攻击的敌人位置。",
    counterplay: "在脉冲前停止移动和攻击，避开下一次位置标记。",
    warningMs: 3_000,
    activeMs: 6_000,
    cooldownMs: 24_000,
  },
  {
    kind: "energy-storm",
    name: "能量风暴",
    summary: "安全区外受到低强度环境伤害和减速，但不会被风暴直接击杀。",
    counterplay: "提前进入安全区、控制入口，或使用保命位移完成撤离。",
    warningMs: 4_000,
    activeMs: 10_000,
    cooldownMs: 24_000,
  },
] as const satisfies readonly MapEventDefinition[];

const EVENT_KINDS = new Set(MAP_EVENT_DEFINITIONS.map((event) => event.kind));

export function isMapEventKind(value: unknown): value is MapEventKind {
  return typeof value === "string" && EVENT_KINDS.has(value as MapEventKind);
}

export function getMapEventDefinition(kind: MapEventKind): MapEventDefinition {
  const definition = MAP_EVENT_DEFINITIONS.find((event) => event.kind === kind);
  if (!definition) throw new Error(`Unknown map event: ${kind}`);
  return definition;
}
