import { MATCH_DURATION_MS } from "../shared/constants";
import { MAP_CATALOG, type MapId } from "../shared/map-catalog";
import { getMapMechanicDefinition, type MapMechanicKind, type MapMechanicPhase } from "../shared/map-mechanics";
import type { GameSnapshot, MapMechanicSnapshot } from "../shared/protocol";

export interface MapMechanicLobbyView {
  mapId: MapId;
  kind: MapMechanicKind;
  title: string;
  summary: string;
  counterplay: string;
  timing: string;
  firstWarning: string;
  disabled: boolean;
}

export interface MapMechanicPresentationProfile {
  tone: "danger" | "boost" | "support";
  primary: string;
  secondary: string;
  icon: string;
}

export interface MapMechanicRenderProfile {
  primary: number;
  secondary: number;
  strokeWidth: number;
  fillAlpha: number;
  shapeMotion: "expand" | "flow" | "converge";
}

const PRESENTATION_PROFILES: Readonly<Record<MapMechanicKind, MapMechanicPresentationProfile>> = {
  "reactor-vent": { tone: "danger", primary: "#ff7048", secondary: "#ffba5c", icon: "!" },
  "neon-overdrive": { tone: "boost", primary: "#37cfff", secondary: "#ff5fe1", icon: "»" },
  "crystal-resonance": { tone: "support", primary: "#a978ff", secondary: "#58f0e0", icon: "✦" },
};

export function mapMechanicLobbyView(mapId: MapId, enabled: boolean): MapMechanicLobbyView {
  const definition = getMapMechanicDefinition(mapId);
  if (!enabled) {
    return {
      mapId,
      kind: definition.kind,
      title: "动态机制已关闭",
      summary: "本局只保留基础地形与常规战斗规则。",
      counterplay: "",
      timing: "",
      firstWarning: "",
      disabled: true,
    };
  }
  return {
    mapId,
    kind: definition.kind,
    title: definition.name,
    summary: definition.summary,
    counterplay: definition.counterplay,
    timing: `预警 ${definition.warningMs / 1_000} 秒 · 生效 ${definition.activeMs / 1_000} 秒`,
    firstWarning: `${definition.firstWarningDelayMs / 1_000} 秒后首次预警`,
    disabled: false,
  };
}

export function randomMapMechanicSummaries(): MapMechanicLobbyView[] {
  return MAP_CATALOG.map((map) => mapMechanicLobbyView(map.id, true));
}

export function mapMechanicPresentationProfile(kind: MapMechanicKind): MapMechanicPresentationProfile {
  return { ...PRESENTATION_PROFILES[kind] };
}

export function formatMechanicCountdown(phaseEndsAt: number, serverTime: number): string {
  return `${Math.max(0, Math.ceil((phaseEndsAt - serverTime) / 1_000))} 秒`;
}

export function mapMechanicMatchKey(snapshot: Pick<GameSnapshot, "mapId" | "serverTime" | "remainingMs">): string {
  const startedAt = snapshot.serverTime - (MATCH_DURATION_MS - snapshot.remainingMs);
  return `${snapshot.mapId ?? "reactor-core"}:${Math.round(startedAt)}`;
}

export function mapMechanicRenderProfile(
  kind: MapMechanicKind,
  phase: MapMechanicPhase,
): MapMechanicRenderProfile | null {
  if (phase !== "warning" && phase !== "active") return null;
  const warning = phase === "warning";
  const profiles: Record<MapMechanicKind, Omit<MapMechanicRenderProfile, "strokeWidth" | "fillAlpha">> = {
    "reactor-vent": { primary: 0xff7048, secondary: 0xffba5c, shapeMotion: "expand" },
    "neon-overdrive": { primary: 0x37cfff, secondary: 0xff5fe1, shapeMotion: "flow" },
    "crystal-resonance": { primary: 0xa978ff, secondary: 0x58f0e0, shapeMotion: "converge" },
  };
  return {
    ...profiles[kind],
    strokeWidth: warning ? 12 : 10,
    fillAlpha: warning ? 0.08 : 0.16,
  };
}

export function mapMechanicStatusText(
  snapshot: MapMechanicSnapshot | null | undefined,
  localPlayerId: string | null,
  serverTime: number,
): string {
  if (!snapshot || (snapshot.phase !== "warning" && snapshot.phase !== "active")) return "";
  const definition = getMapMechanicDefinition(kindMapId(snapshot.kind));
  if (snapshot.phase === "warning") {
    return `${definition.name} · ${formatMechanicCountdown(snapshot.phaseEndsAt, serverTime)}后启动`;
  }
  if (snapshot.kind === "reactor-vent") return `${definition.name} · 区域持续伤害`;
  if (snapshot.kind === "neon-overdrive") return `${definition.name} · 移速 +12% · 射速与弹速强化`;
  const local = snapshot.participants.find((participant) => participant.playerId === localPlayerId);
  if (local?.claimed) return `${definition.name} · 共鸣增益已获得`;
  if (local) return `${definition.name} · 共鸣进度 ${Math.round(local.chargeProgress * 100)}%`;
  return `${definition.name} · 驻留充能可获得减伤与治疗`;
}

export function mapMechanicVisualRevision(snapshot: MapMechanicSnapshot | null | undefined): string {
  if (!snapshot || (snapshot.phase !== "warning" && snapshot.phase !== "active")) return "hidden";
  const zone = snapshot.zone.kind === "circle"
    ? `circle:${snapshot.zone.x}:${snapshot.zone.y}:${snapshot.zone.radius}`
    : `rect:${snapshot.zone.x}:${snapshot.zone.y}:${snapshot.zone.width}:${snapshot.zone.height}`;
  return `${snapshot.kind}:${snapshot.phase}:${snapshot.round}:${snapshot.zoneIndex}:${zone}`;
}

function kindMapId(kind: MapMechanicKind): MapId {
  if (kind === "reactor-vent") return "reactor-core";
  if (kind === "neon-overdrive") return "neon-docks";
  return "crystal-ruins";
}
