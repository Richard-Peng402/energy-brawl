import type { Rect, Vec2 } from "./protocol";

export const MAX_PLAYERS = 6;
export const MAX_HEALTH = 100;
export const PROJECTILE_DAMAGE = 25;
export const KILL_SCORE = 2;
export const HOLDER_KILL_BONUS = 1;
export const ENERGY_SCORE = 1;
export const TARGET_SCORE = 20;
export const MATCH_DURATION_MS = 480_000;
export const HOLD_DURATION_MS = 30_000;
export const LOBBY_RETURN_DELAY_MS = 8_000;
export const RESPAWN_DELAY_MS = 3_000;
export const SPAWN_SHIELD_MS = 1_500;
export const COMBAT_REGEN_DELAY_MS = 3_000;
export const COMBAT_REGEN_PER_SECOND = 10;
export const RECONNECT_WINDOW_MS = 30_000;
export const SERVER_TICK_RATE = 60;
export const SERVER_TICK_MS = 1_000 / SERVER_TICK_RATE;
export const SNAPSHOT_RATE = 30;
export const REDUCED_SNAPSHOT_RATE = 20;

export const ARENA_SCALE = 4 / 3;
export const ARENA_WIDTH = 2_880;
export const ARENA_HEIGHT = 1_620;
export const VIEW_WIDTH = 1_536;
export const VIEW_HEIGHT = 864;
export const PLAYER_RADIUS = 27;
export const PLAYER_SPEED = 265;
export const FIRE_COOLDOWN_MS = 450;
export const PROJECTILE_RADIUS = 8;
export const PROJECTILE_SPEED = 620;
export const PROJECTILE_MAX_DISTANCE = 1_150;
export const ENERGY_RADIUS = 18;
export const ENERGY_RESPAWN_MS = 5_000;
export const MAX_ENERGY = 6;
export const MAX_SKILL_ORBS = 6;
export const SKILL_ORB_RADIUS = 20;
export const SKILL_ORB_SPAWN_MIN_MS = 4_000;
export const SKILL_ORB_SPAWN_MAX_MS = 7_000;
export const SKILL_ORB_SAFE_DISTANCE = 170;
export const SKILL_ACTION_MAX_JUMP = 1_024;
export const DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS = 10_000;
export const MIN_EXCLUSIVE_SKILL_COOLDOWN_MS = 1_000;
export const MAX_EXCLUSIVE_SKILL_COOLDOWN_MS = 60_000;

export const PLAYER_COLORS = [
  "#ff5a5f",
  "#31d0aa",
  "#4da3ff",
  "#ffd166",
  "#c77dff",
  "#ff8c42",
] as const;

const scalePoint = ({ x, y }: Vec2): Vec2 => ({
  x: x * ARENA_SCALE,
  y: y * ARENA_SCALE,
});

const scaleRect = ({ x, y, width, height }: Rect): Rect => ({
  x: x * ARENA_SCALE,
  y: y * ARENA_SCALE,
  width: width * ARENA_SCALE,
  height: height * ARENA_SCALE,
});

export const SPAWN_POINTS: readonly Vec2[] = [
  { x: 260, y: 260 },
  { x: 1080, y: 210 },
  { x: 1900, y: 260 },
  { x: 260, y: 955 },
  { x: 1080, y: 1005 },
  { x: 1900, y: 955 },
].map(scalePoint);

export const ENERGY_SPAWN_POINTS: readonly Vec2[] = [
  { x: 1080, y: 350 },
  { x: 1080, y: 865 },
  { x: 520, y: 607 },
  { x: 1640, y: 607 },
  { x: 760, y: 300 },
  { x: 1400, y: 915 },
  { x: 760, y: 915 },
  { x: 1400, y: 300 },
  { x: 300, y: 607 },
  { x: 1860, y: 607 },
].map(scalePoint);

export const SKILL_ORB_SPAWN_POINTS: readonly Vec2[] = [
  { x: 1080, y: 350 },
  { x: 570, y: 250 },
  { x: 1590, y: 965 },
  { x: 1590, y: 250 },
  { x: 570, y: 965 },
  { x: 1080, y: 110 },
  { x: 1080, y: 1105 },
  { x: 205, y: 607 },
  { x: 1955, y: 607 },
].map(scalePoint);

export const WALLS: readonly Rect[] = [
  { x: 930, y: 475, width: 300, height: 55 },
  { x: 930, y: 685, width: 300, height: 55 },
  { x: 790, y: 535, width: 55, height: 145 },
  { x: 1315, y: 535, width: 55, height: 145 },
  { x: 390, y: 330, width: 260, height: 55 },
  { x: 390, y: 330, width: 55, height: 190 },
  { x: 1510, y: 330, width: 260, height: 55 },
  { x: 1715, y: 330, width: 55, height: 190 },
  { x: 390, y: 830, width: 260, height: 55 },
  { x: 390, y: 695, width: 55, height: 190 },
  { x: 1510, y: 830, width: 260, height: 55 },
  { x: 1715, y: 695, width: 55, height: 190 },
  { x: 720, y: 155, width: 180, height: 45 },
  { x: 1260, y: 1015, width: 180, height: 45 },
].map(scaleRect);
