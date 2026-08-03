import type { Rect, Vec2 } from "./protocol";

export const MAX_PLAYERS = 6;
export const MAX_HEALTH = 100;
export const PROJECTILE_DAMAGE = 25;
export const KILL_SCORE = 3;
export const ENERGY_SCORE = 1;
export const TARGET_SCORE = 15;
export const MATCH_DURATION_MS = 300_000;
export const RESPAWN_DELAY_MS = 3_000;
export const SPAWN_SHIELD_MS = 1_500;
export const RECONNECT_WINDOW_MS = 30_000;
export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_MS = 1_000 / SERVER_TICK_RATE;
export const SNAPSHOT_RATE = 15;

export const ARENA_WIDTH = 1_600;
export const ARENA_HEIGHT = 900;
export const PLAYER_RADIUS = 27;
export const PLAYER_SPEED = 310;
export const FIRE_COOLDOWN_MS = 360;
export const PROJECTILE_RADIUS = 8;
export const PROJECTILE_SPEED = 720;
export const PROJECTILE_LIFETIME_MS = 1_600;
export const ENERGY_RADIUS = 18;
export const ENERGY_RESPAWN_MS = 2_000;
export const MAX_ENERGY = 10;

export const PLAYER_COLORS = [
  "#ff5a5f",
  "#31d0aa",
  "#4da3ff",
  "#ffd166",
  "#c77dff",
  "#ff8c42",
] as const;

export const SPAWN_POINTS: readonly Vec2[] = [
  { x: 180, y: 180 },
  { x: 800, y: 130 },
  { x: 1_420, y: 180 },
  { x: 180, y: 720 },
  { x: 800, y: 770 },
  { x: 1_420, y: 720 },
];

export const ENERGY_SPAWN_POINTS: readonly Vec2[] = [
  { x: 800, y: 450 },
  { x: 680, y: 390 },
  { x: 920, y: 510 },
  { x: 330, y: 250 },
  { x: 1_270, y: 250 },
  { x: 330, y: 650 },
  { x: 1_270, y: 650 },
  { x: 800, y: 230 },
  { x: 800, y: 670 },
  { x: 520, y: 450 },
  { x: 1_080, y: 450 },
  { x: 200, y: 450 },
  { x: 1_400, y: 450 },
];

export const WALLS: readonly Rect[] = [
  { x: 450, y: 180, width: 90, height: 210 },
  { x: 1_060, y: 180, width: 90, height: 210 },
  { x: 450, y: 510, width: 90, height: 210 },
  { x: 1_060, y: 510, width: 90, height: 210 },
  { x: 700, y: 400, width: 200, height: 100 },
];
