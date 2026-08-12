import type { MapId } from "../shared/map-catalog";

export interface ArenaDecoration {
  prop: 0 | 1 | 2;
  x: number;
  y: number;
  scale: number;
  rotation?: number;
  alpha?: number;
  tint?: number;
}

export interface MapVisualProfile {
  backgroundColor: number;
  perimeterGridColor: number;
  floorTint: number;
  floorAlpha: number;
  gridColor: number;
  gridAlpha: number;
  primaryColor: number;
  accentColor: number;
  wallFill: number;
  wallTint: number;
  wallTextureAlpha: number;
  wallStrokeColor: number;
  decalTint: number;
  decalAlpha: number;
  lightTint: number;
  decorations: readonly ArenaDecoration[];
}

export const MAP_VISUAL_PROFILES: Readonly<Record<MapId, MapVisualProfile>> = {
  "reactor-core": {
    backgroundColor: 0x020710,
    perimeterGridColor: 0x236d8b,
    floorTint: 0x687684,
    floorAlpha: 0.92,
    gridColor: 0x63ddff,
    gridAlpha: 0.055,
    primaryColor: 0x37d8ff,
    accentColor: 0xffa63d,
    wallFill: 0x142a36,
    wallTint: 0x8db5c3,
    wallTextureAlpha: 0.82,
    wallStrokeColor: 0x73e7ff,
    decalTint: 0x5fe5ff,
    decalAlpha: 0.62,
    lightTint: 0x42d9ff,
    decorations: [
      { prop: 0, x: 185, y: 145, scale: 1.05 }, { prop: 0, x: 2_695, y: 1_475, scale: 1.05, rotation: Math.PI },
      { prop: 1, x: 1_440, y: 142, scale: 1.1 }, { prop: 1, x: 1_440, y: 1_478, scale: 1.1, rotation: Math.PI },
      { prop: 2, x: 115, y: 810, scale: 0.86 }, { prop: 2, x: 2_765, y: 810, scale: 0.86 },
      { prop: 0, x: 760, y: 92, scale: 0.72, alpha: 0.76 }, { prop: 0, x: 2_120, y: 1_528, scale: 0.72, rotation: Math.PI, alpha: 0.76 },
    ],
  },
  "neon-docks": {
    backgroundColor: 0x030815,
    perimeterGridColor: 0x285d78,
    floorTint: 0x315f82,
    floorAlpha: 0.82,
    gridColor: 0x46dff6,
    gridAlpha: 0.06,
    primaryColor: 0x43e8ff,
    accentColor: 0xff4fc4,
    wallFill: 0x14213d,
    wallTint: 0x8ca4e8,
    wallTextureAlpha: 0.72,
    wallStrokeColor: 0x55eaff,
    decalTint: 0xff5ac8,
    decalAlpha: 0.72,
    lightTint: 0x3fbcff,
    decorations: [
      { prop: 0, x: 150, y: 155, scale: 1.08 }, { prop: 0, x: 2_730, y: 1_465, scale: 1.08, rotation: Math.PI },
      { prop: 1, x: 1_440, y: 120, scale: 1.12 }, { prop: 1, x: 1_440, y: 1_500, scale: 1.12, rotation: Math.PI },
      { prop: 2, x: 90, y: 580, scale: 0.95 }, { prop: 2, x: 2_790, y: 1_040, scale: 0.95, rotation: Math.PI },
      { prop: 1, x: 710, y: 95, scale: 0.72, alpha: 0.82 }, { prop: 1, x: 2_170, y: 1_525, scale: 0.72, rotation: Math.PI, alpha: 0.82 },
    ],
  },
  "crystal-ruins": {
    backgroundColor: 0x080512,
    perimeterGridColor: 0x614787,
    floorTint: 0x827aa8,
    floorAlpha: 0.9,
    gridColor: 0xa78cff,
    gridAlpha: 0.052,
    primaryColor: 0xa98cff,
    accentColor: 0x60f0d2,
    wallFill: 0x261b36,
    wallTint: 0x9e83c8,
    wallTextureAlpha: 0.76,
    wallStrokeColor: 0xbda4ff,
    decalTint: 0xc08dff,
    decalAlpha: 0.86,
    lightTint: 0x9f76ff,
    decorations: [
      { prop: 0, x: 150, y: 170, scale: 1.22 }, { prop: 0, x: 2_730, y: 1_450, scale: 1.22 },
      { prop: 1, x: 1_440, y: 118, scale: 1.12, tint: 0xb57cff }, { prop: 1, x: 1_440, y: 1_502, scale: 1.12, rotation: Math.PI, tint: 0xb57cff },
      { prop: 2, x: 105, y: 810, scale: 1.02, tint: 0x8de6ff }, { prop: 2, x: 2_775, y: 810, scale: 1.02, tint: 0x8de6ff },
      { prop: 1, x: 725, y: 105, scale: 0.78, alpha: 0.86, tint: 0xd17dff }, { prop: 1, x: 2_155, y: 1_515, scale: 0.78, rotation: Math.PI, alpha: 0.86, tint: 0xd17dff },
    ],
  },
};

export function getMapVisualProfile(mapId: MapId): MapVisualProfile {
  return MAP_VISUAL_PROFILES[mapId];
}
