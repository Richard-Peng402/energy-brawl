import { ARENA_HEIGHT, ARENA_WIDTH, ENERGY_SPAWN_POINTS, SKILL_ORB_SPAWN_POINTS, SPAWN_POINTS, WALLS } from "./constants";
import type { MatchMode } from "./mode-catalog";
import type { Rect, Vec2 } from "./protocol";

export type MapId = "reactor-core" | "neon-docks" | "crystal-ruins";
export type MapSelection = MapId | "random";

export interface MapDefinition {
  id: MapId;
  name: string;
  theme: "reactor" | "neon" | "crystal";
  walls: readonly Rect[];
  spawnPoints: readonly Vec2[];
  spawnPointsByMode?: Partial<Record<MatchMode, readonly Vec2[]>>;
  energySpawnPoints: readonly Vec2[];
  skillOrbSpawnPoints: readonly Vec2[];
  capturePointCenter: Vec2;
}

const neonWalls: readonly Rect[] = [
  { x: 420, y: 250, width: 520, height: 52 }, { x: 1_940, y: 250, width: 520, height: 52 },
  { x: 420, y: 1_318, width: 520, height: 52 }, { x: 1_940, y: 1_318, width: 520, height: 52 },
  { x: 1_110, y: 390, width: 660, height: 48 }, { x: 1_110, y: 1_182, width: 660, height: 48 },
  { x: 920, y: 610, width: 52, height: 400 }, { x: 1_908, y: 610, width: 52, height: 400 },
  { x: 1_410, y: 790, width: 60, height: 60 },
];

const crystalWalls: readonly Rect[] = [
  { x: 520, y: 350, width: 300, height: 260 }, { x: 2_060, y: 350, width: 300, height: 260 },
  { x: 520, y: 1_010, width: 300, height: 260 }, { x: 2_060, y: 1_010, width: 300, height: 260 },
  { x: 1_250, y: 300, width: 380, height: 56 }, { x: 1_250, y: 1_264, width: 380, height: 56 },
  { x: 1_060, y: 590, width: 58, height: 440 }, { x: 1_762, y: 590, width: 58, height: 440 },
  { x: 1_370, y: 730, width: 140, height: 140 },
];

const neonSpawns: readonly Vec2[] = [
  { x: 260, y: 180 }, { x: ARENA_WIDTH - 260, y: 180 }, { x: ARENA_WIDTH / 2, y: 220 },
  { x: 260, y: ARENA_HEIGHT - 180 }, { x: ARENA_WIDTH - 260, y: ARENA_HEIGHT - 180 }, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 220 },
];

const crystalSpawns: readonly Vec2[] = [
  { x: 250, y: 250 }, { x: ARENA_WIDTH - 250, y: 250 }, { x: ARENA_WIDTH / 2, y: 260 },
  { x: 250, y: ARENA_HEIGHT - 250 }, { x: ARENA_WIDTH - 250, y: ARENA_HEIGHT - 250 }, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 260 },
];

const teamSpawns = (left: number, right: number): readonly Vec2[] => [
  { x: left, y: 260 }, { x: left, y: ARENA_HEIGHT / 2 }, { x: left, y: ARENA_HEIGHT - 260 },
  { x: right, y: 260 }, { x: right, y: ARENA_HEIGHT / 2 }, { x: right, y: ARENA_HEIGHT - 260 },
];

export const MAP_CATALOG: readonly MapDefinition[] = [
  {
    id: "reactor-core", name: "反应堆核心", theme: "reactor", walls: WALLS, spawnPoints: SPAWN_POINTS,
    energySpawnPoints: ENERGY_SPAWN_POINTS, skillOrbSpawnPoints: SKILL_ORB_SPAWN_POINTS,
    capturePointCenter: { x: 1_440, y: 810 },
  },
  {
    id: "neon-docks", name: "霓虹港区", theme: "neon", walls: neonWalls, spawnPoints: neonSpawns,
    spawnPointsByMode: { team3v3: teamSpawns(300, ARENA_WIDTH - 300), domination3v3: teamSpawns(300, ARENA_WIDTH - 300), domination2v2v2: neonSpawns },
    energySpawnPoints: [{ x: ARENA_WIDTH / 2, y: 520 }, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 520 }, { x: 760, y: ARENA_HEIGHT / 2 }, { x: ARENA_WIDTH - 760, y: ARENA_HEIGHT / 2 }, { x: 760, y: 420 }, { x: ARENA_WIDTH - 760, y: ARENA_HEIGHT - 420 }],
    skillOrbSpawnPoints: [{ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }, { x: 620, y: 470 }, { x: ARENA_WIDTH - 620, y: 470 }, { x: 620, y: ARENA_HEIGHT - 470 }, { x: ARENA_WIDTH - 620, y: ARENA_HEIGHT - 470 }],
    capturePointCenter: { x: 1_440, y: 620 },
  },
  {
    id: "crystal-ruins", name: "晶脉遗迹", theme: "crystal", walls: crystalWalls, spawnPoints: crystalSpawns,
    spawnPointsByMode: { team3v3: teamSpawns(360, ARENA_WIDTH - 360), domination3v3: teamSpawns(360, ARENA_WIDTH - 360), domination2v2v2: crystalSpawns },
    energySpawnPoints: [{ x: ARENA_WIDTH / 2, y: 420 }, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 420 }, { x: 880, y: ARENA_HEIGHT / 2 }, { x: ARENA_WIDTH - 880, y: ARENA_HEIGHT / 2 }, { x: 620, y: 760 }, { x: ARENA_WIDTH - 620, y: 760 }],
    skillOrbSpawnPoints: [{ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }, { x: 920, y: 420 }, { x: ARENA_WIDTH - 920, y: 420 }, { x: 920, y: ARENA_HEIGHT - 420 }, { x: ARENA_WIDTH - 920, y: ARENA_HEIGHT - 420 }],
    capturePointCenter: { x: 1_440, y: 590 },
  },
];

export function getMapDefinition(id: MapId): MapDefinition {
  return MAP_CATALOG.find((map) => map.id === id) ?? MAP_CATALOG[0]!;
}

export function resolveMapSelection(selection: MapSelection, previousId: MapId | null = null, randomValue = Math.random()): MapDefinition {
  if (selection !== "random") return getMapDefinition(selection);
  const candidates = MAP_CATALOG.filter((map) => map.id !== previousId);
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(randomValue * candidates.length)));
  return candidates[index] ?? MAP_CATALOG[0]!;
}
