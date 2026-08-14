import { MATCH_DURATION_MS } from "../shared/constants";
import { MAP_CATALOG, type MapId } from "../shared/map-catalog";
import { getMapMechanicDefinition, type MapMechanicKind } from "../shared/map-mechanics";
import type { GameSnapshot } from "../shared/protocol";

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
