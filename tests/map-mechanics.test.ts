import { describe, expect, it } from "vitest";

import { PLAYER_RADIUS } from "../src/shared/constants";
import { MAP_CATALOG } from "../src/shared/map-catalog";
import { circleHitsRect } from "../src/shared/math";
import {
  MAP_MECHANICS,
  getMapMechanicDefinition,
  mapMechanicLobbyDescription,
  zoneBounds,
  zoneContainsPoint,
} from "../src/shared/map-mechanics";
import type { GameSnapshot, HostAdminCommand, MapMechanicSnapshot, RoomSnapshot } from "../src/shared/protocol";

describe("dynamic map mechanic catalog", () => {
  it("defines one distinct mechanic for every map", () => {
    expect(Object.keys(MAP_MECHANICS)).toEqual(["reactor-core", "neon-docks", "crystal-ruins"]);
    expect(new Set(Object.values(MAP_MECHANICS).map((entry) => entry.kind)).size).toBe(3);
    expect(getMapMechanicDefinition("reactor-core")).toMatchObject({
      kind: "reactor-vent",
      firstWarningDelayMs: 20_000,
      warningMs: 4_000,
      activeMs: 8_000,
      cooldownMs: 20_000,
      effect: { damagePerSecond: 8, damageTickMs: 1_000 },
    });
    expect(getMapMechanicDefinition("neon-docks").effect).toEqual({
      moveMultiplier: 1.12,
      fireCooldownMultiplier: 0.9,
      projectileSpeedMultiplier: 1.15,
      graceMs: 1_000,
    });
    expect(getMapMechanicDefinition("crystal-ruins").effect).toEqual({
      chargeMs: 1_250,
      durationMs: 6_000,
      damageTakenMultiplier: 0.85,
      healingPerSecond: 3,
    });
  });

  it("keeps configured zones away from spawn and pickup anchors", () => {
    for (const map of MAP_CATALOG) {
      const definition = getMapMechanicDefinition(map.id);
      const anchors = [...map.spawnPoints, ...map.energySpawnPoints, ...map.skillOrbSpawnPoints];
      for (const zone of definition.zones) {
        for (const point of anchors) {
          const padding = map.id === "reactor-core" ? 0 : PLAYER_RADIUS + 36;
          expect(zoneContainsPoint(zone, point, padding), `${map.id} zone overlaps an anchor`).toBe(false);
        }
      }
    }
  });

  it("keeps neon and crystal zones outside wall rectangles", () => {
    for (const map of MAP_CATALOG.filter((entry) => entry.id !== "reactor-core")) {
      for (const zone of getMapMechanicDefinition(map.id).zones) {
        const overlapsWall = map.walls.some((wall) => zone.kind === "circle"
          ? circleHitsRect(zone, zone.radius, wall)
          : rectanglesOverlap(zoneBounds(zone), wall));
        expect(overlapsWall, `${map.id} zone overlaps a wall`).toBe(false);
      }
    }
  });

  it("provides concise lobby explanations with counterplay", () => {
    expect(mapMechanicLobbyDescription("reactor-core")).toContain("核心泄压");
    expect(mapMechanicLobbyDescription("neon-docks")).toContain("轨道过载");
    expect(mapMechanicLobbyDescription("crystal-ruins")).toContain("晶脉共鸣");
    for (const map of MAP_CATALOG) {
      const text = mapMechanicLobbyDescription(map.id);
      expect(text).toContain(getMapMechanicDefinition(map.id).counterplay);
    }
  });
});

describe("dynamic map mechanic protocol", () => {
  it("carries host settings and authoritative match state", () => {
    const command: HostAdminCommand = { type: "setMapMechanics", enabled: false };
    const room = { mapMechanicsEnabled: true } satisfies Pick<RoomSnapshot, "mapMechanicsEnabled">;
    const mechanic: MapMechanicSnapshot = {
      kind: "neon-overdrive",
      phase: "warning",
      round: 0,
      zoneIndex: 0,
      zone: { kind: "rect", x: 1_000, y: 600, width: 880, height: 120 },
      phaseStartedAt: 21_000,
      phaseEndsAt: 25_000,
      participants: [],
    };
    const game = { mapMechanic: mechanic } satisfies Pick<GameSnapshot, "mapMechanic">;

    expect(command).toEqual({ type: "setMapMechanics", enabled: false });
    expect(room.mapMechanicsEnabled).toBe(true);
    expect(game.mapMechanic).toBe(mechanic);
  });
});

function rectanglesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
