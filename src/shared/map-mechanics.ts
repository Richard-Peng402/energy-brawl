import type { MapId } from "./map-catalog";
import type { Rect, Vec2 } from "./protocol";

export type MapMechanicKind = "reactor-vent" | "neon-overdrive" | "crystal-resonance";
export type MapMechanicPhase = "idle" | "warning" | "active" | "cooldown";

export type MapMechanicZone =
  | { kind: "circle"; x: number; y: number; radius: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number };

interface MapMechanicDefinitionBase {
  mapId: MapId;
  kind: MapMechanicKind;
  name: string;
  summary: string;
  counterplay: string;
  firstWarningDelayMs: 20_000;
  warningMs: 4_000;
  activeMs: 8_000;
  cooldownMs: 20_000;
  zones: readonly MapMechanicZone[];
}

export interface ReactorVentDefinition extends MapMechanicDefinitionBase {
  kind: "reactor-vent";
  effect: Readonly<{ damagePerSecond: 8; damageTickMs: 1_000 }>;
}

export interface NeonOverdriveDefinition extends MapMechanicDefinitionBase {
  kind: "neon-overdrive";
  effect: Readonly<{
    moveMultiplier: 1.12;
    fireCooldownMultiplier: 0.9;
    projectileSpeedMultiplier: 1.15;
    graceMs: 1_000;
  }>;
}

export interface CrystalResonanceDefinition extends MapMechanicDefinitionBase {
  kind: "crystal-resonance";
  effect: Readonly<{
    chargeMs: 1_250;
    durationMs: 6_000;
    damageTakenMultiplier: 0.85;
    healingPerSecond: 3;
  }>;
}

export type MapMechanicDefinition = ReactorVentDefinition | NeonOverdriveDefinition | CrystalResonanceDefinition;

export const MAP_MECHANICS = {
  "reactor-core": {
    mapId: "reactor-core",
    kind: "reactor-vent",
    name: "核心泄压",
    summary: "中央反应区周期性升温，预警结束后持续造成环境伤害。",
    counterplay: "看到橙红预警后立即离开核心区，生效期间不要强行穿越。",
    firstWarningDelayMs: 20_000,
    warningMs: 4_000,
    activeMs: 8_000,
    cooldownMs: 20_000,
    zones: [{ kind: "circle", x: 1_440, y: 810, radius: 300 }],
    effect: { damagePerSecond: 8, damageTickMs: 1_000 },
  },
  "neon-docks": {
    mapId: "neon-docks",
    kind: "neon-overdrive",
    name: "轨道过载",
    summary: "上下中央通道交替充能，为进入者强化移动、射速和弹速。",
    counterplay: "利用亮起的通道快速转线，也可在出口伏击获得增益的对手。",
    firstWarningDelayMs: 20_000,
    warningMs: 4_000,
    activeMs: 8_000,
    cooldownMs: 20_000,
    zones: [
      { kind: "rect", x: 1_000, y: 600, width: 880, height: 120 },
      { kind: "rect", x: 1_000, y: 900, width: 880, height: 120 },
    ],
    effect: { moveMultiplier: 1.12, fireCooldownMultiplier: 0.9, projectileSpeedMultiplier: 1.15, graceMs: 1_000 },
  },
  "crystal-ruins": {
    mapId: "crystal-ruins",
    kind: "crystal-resonance",
    name: "晶脉共鸣",
    summary: "四处晶脉依次苏醒，完成短暂共鸣可获得减伤和持续治疗。",
    counterplay: "在安全时驻留完成共鸣；被人数压制时应先撤离再争夺下一处。",
    firstWarningDelayMs: 20_000,
    warningMs: 4_000,
    activeMs: 8_000,
    cooldownMs: 20_000,
    zones: [
      { kind: "circle", x: 1_100, y: 450, radius: 100 },
      { kind: "circle", x: 1_780, y: 450, radius: 100 },
      { kind: "circle", x: 1_780, y: 1_170, radius: 100 },
      { kind: "circle", x: 1_100, y: 1_170, radius: 100 },
    ],
    effect: { chargeMs: 1_250, durationMs: 6_000, damageTakenMultiplier: 0.85, healingPerSecond: 3 },
  },
} as const satisfies Record<MapId, MapMechanicDefinition>;

export function getMapMechanicDefinition(mapId: MapId): MapMechanicDefinition {
  return MAP_MECHANICS[mapId];
}

export function zoneContainsPoint(zone: MapMechanicZone, point: Vec2, padding = 0): boolean {
  if (zone.kind === "circle") {
    const radius = zone.radius + padding;
    return (point.x - zone.x) ** 2 + (point.y - zone.y) ** 2 <= radius ** 2;
  }
  return point.x >= zone.x - padding
    && point.x <= zone.x + zone.width + padding
    && point.y >= zone.y - padding
    && point.y <= zone.y + zone.height + padding;
}

export function zoneBounds(zone: MapMechanicZone): Rect {
  if (zone.kind === "rect") return { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
  return {
    x: zone.x - zone.radius,
    y: zone.y - zone.radius,
    width: zone.radius * 2,
    height: zone.radius * 2,
  };
}

export function mapMechanicLobbyDescription(mapId: MapId): string {
  const definition = getMapMechanicDefinition(mapId);
  return `${definition.name}：${definition.summary} 应对：${definition.counterplay}`;
}
