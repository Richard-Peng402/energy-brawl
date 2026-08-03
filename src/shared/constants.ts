import type { Rect, Vec2 } from "./protocol";

export const MAX_PLAYERS = 6;
export const MAX_HEALTH = 100;
export const PROJECTILE_DAMAGE = 25;
export const KILL_SCORE = 2;
export const HOLDER_KILL_BONUS = 1;
export const ENERGY_SCORE = 1;
export const TARGET_SCORE = 15;
export const MATCH_DURATION_MS = 480_000;
export const HOLD_DURATION_MS = 30_000;
export const LOBBY_RETURN_DELAY_MS = 8_000;
export const RESPAWN_DELAY_MS = 3_000;
export const SPAWN_SHIELD_MS = 1_500;
export const RECONNECT_WINDOW_MS = 30_000;
export const SERVER_TICK_RATE = 60;
export const SERVER_TICK_MS = 1_000 / SERVER_TICK_RATE;
export const SNAPSHOT_RATE = 30;
export const REDUCED_SNAPSHOT_RATE = 20;

export const ARENA_WIDTH = 2_160;
export const ARENA_HEIGHT = 1_215;
export const VIEW_WIDTH = 1_280;
export const VIEW_HEIGHT = 720;
export const PLAYER_RADIUS = 27;
export const PLAYER_SPEED = 265;
export const FIRE_COOLDOWN_MS = 450;
export const PROJECTILE_RADIUS = 8;
export const PROJECTILE_SPEED = 620;
export const PROJECTILE_LIFETIME_MS = 1_850;
export const ENERGY_RADIUS = 18;
export const ENERGY_RESPAWN_MS = 5_000;
export const MAX_ENERGY = 6;

export const PLAYER_COLORS = [
  "#ff5a5f",
  "#31d0aa",
  "#4da3ff",
  "#ffd166",
  "#c77dff",
  "#ff8c42",
] as const;

export const SPAWN_POINTS: readonly Vec2[] = [
  { x: 260, y: 260 },
  { x: 1080, y: 210 },
  { x: 1900, y: 260 },
  { x: 260, y: 955 },
  { x: 1080, y: 1005 },
  { x: 1900, y: 955 },
];

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
];

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
];
