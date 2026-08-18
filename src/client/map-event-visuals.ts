import type { MapEventKind, MapEventSnapshot } from "../shared/map-events";

export const MAX_MAP_EVENT_PARTICLES = 32;

export type MapEventVisualShape = "beacon" | "barrier-field" | "scan-ring" | "storm-boundary";

export interface MapEventVisualModel {
  shape: MapEventVisualShape;
  label: string;
  primary: number;
  secondary: number;
  strokeWidth: number;
  fillAlpha: number;
  motion: "rise" | "barrier" | "sweep" | "orbit";
}

export interface MapEventVisualParticle {
  slot: number;
  phase: number;
}

export interface MapEventVisualState {
  revision: string;
  particles: MapEventVisualParticle[];
}

export interface MapEventLobbyView {
  enabled: boolean;
  title: string;
  summary: string;
  counterplay: string;
}

export interface MapEventFeedbackEvent {
  key: string;
  kind: MapEventKind;
  stage: "warning" | "active";
  at: number;
}

const VISUAL_MODELS: Readonly<Record<MapEventKind, Omit<MapEventVisualModel, "strokeWidth" | "fillAlpha">>> = {
  "supply-drop": {
    shape: "beacon",
    label: "限时补给",
    primary: 0x5df5b5,
    secondary: 0xffdd75,
    motion: "rise",
  },
  "area-lockdown": {
    shape: "barrier-field",
    label: "区域封锁",
    primary: 0xff625f,
    secondary: 0xffb14a,
    motion: "barrier",
  },
  "global-scan": {
    shape: "scan-ring",
    label: "全图扫描",
    primary: 0x48d9ff,
    secondary: 0xa584ff,
    motion: "sweep",
  },
  "energy-storm": {
    shape: "storm-boundary",
    label: "能量风暴",
    primary: 0xb169ff,
    secondary: 0x4ef4ff,
    motion: "orbit",
  },
};

export function mapEventVisualModel(snapshot: Pick<MapEventSnapshot, "kind" | "phase">): MapEventVisualModel {
  const warning = snapshot.phase === "warning";
  return {
    ...VISUAL_MODELS[snapshot.kind],
    strokeWidth: warning ? 14 : 11,
    fillAlpha: warning ? 0.07 : 0.14,
  };
}

export function createMapEventVisualState(): MapEventVisualState {
  return { revision: "hidden", particles: [] };
}

export function syncMapEventVisualState(state: MapEventVisualState, snapshot: MapEventSnapshot | null | undefined): void {
  state.revision = mapEventVisualRevision(snapshot);
  if (state.revision === "hidden") {
    state.particles.length = 0;
    return;
  }
  while (state.particles.length < MAX_MAP_EVENT_PARTICLES) {
    const slot = state.particles.length;
    state.particles.push({ slot, phase: slot / MAX_MAP_EVENT_PARTICLES });
  }
  if (state.particles.length > MAX_MAP_EVENT_PARTICLES) state.particles.length = MAX_MAP_EVENT_PARTICLES;
}

export function mapEventLobbyView(enabled: boolean): MapEventLobbyView {
  if (!enabled) {
    return {
      enabled: false,
      title: "临时事件已关闭",
      summary: "本局不会触发额外的限时战场事件。",
      counterplay: "",
    };
  }
  return {
    enabled: true,
    title: "临时地图事件",
    summary: "补给、区域封锁、全图扫描与能量风暴会在对局中轮换出现。",
    counterplay: "观察预警边界：抢安全补给、绕开封锁、扫描时停火，风暴中进入安全区。",
  };
}

export function mapEventStatusText(
  snapshot: MapEventSnapshot | null | undefined,
  localPlayerId: string | null,
  serverTime: number,
): string {
  if (!snapshot || (snapshot.phase !== "warning" && snapshot.phase !== "active")) return "";
  const model = mapEventVisualModel(snapshot);
  if (snapshot.phase === "warning") {
    const seconds = Math.max(0, Math.ceil((snapshot.phaseEndsAt - serverTime) / 1_000));
    return `${model.label} · ${seconds} 秒后生效`;
  }
  if (snapshot.kind === "supply-drop") {
    const local = snapshot.participants.find((participant) => participant.playerId === localPlayerId);
    return local?.progress === undefined
      ? "限时补给 · 持续占领 1 秒恢复生命并补充技能"
      : `限时补给 · 占领进度 ${Math.round(local.progress * 100)}%`;
  }
  if (snapshot.kind === "area-lockdown") return "区域封锁 · 宽限结束后减速并持续受伤";
  if (snapshot.kind === "global-scan") return "全图扫描 · 停止移动和射击可避免暴露";
  return "能量风暴 · 立即进入标记安全区";
}

export function mapEventVisualRevision(snapshot: MapEventSnapshot | null | undefined): string {
  if (!snapshot || (snapshot.phase !== "warning" && snapshot.phase !== "active")) return "hidden";
  const geometry = snapshot.point
    ? `point:${snapshot.point.x}:${snapshot.point.y}`
    : snapshot.zone?.kind === "circle"
      ? `circle:${snapshot.zone.x}:${snapshot.zone.y}:${snapshot.zone.radius}`
      : snapshot.zone
        ? `rect:${snapshot.zone.x}:${snapshot.zone.y}:${snapshot.zone.width}:${snapshot.zone.height}`
        : "arena";
  return `round:${snapshot.round}:${snapshot.eventSeq}:${snapshot.kind}:${snapshot.phase}:${geometry}`;
}

export function selectMapEventFeedback(
  previous: MapEventSnapshot | null | undefined,
  next: MapEventSnapshot | null | undefined,
  serverTime: number,
): MapEventFeedbackEvent | null {
  if (!next || (next.phase !== "warning" && next.phase !== "active")) return null;
  const key = `${next.round}:${next.eventSeq}:${next.kind}:${next.phase}`;
  if (previous && `${previous.round}:${previous.eventSeq}:${previous.kind}:${previous.phase}` === key) return null;
  return { key, kind: next.kind, stage: next.phase, at: serverTime };
}
