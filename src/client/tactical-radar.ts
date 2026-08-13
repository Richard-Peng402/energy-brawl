import { ARENA_HEIGHT, ARENA_WIDTH } from "../shared/constants";
import { firstWallHit } from "../shared/collision";
import { getMapDefinition } from "../shared/map-catalog";
import type { GameSnapshot, PlayerSnapshot, Rect, Vec2 } from "../shared/protocol";

const ENEMY_AWARENESS_RADIUS = 900;
const MAX_ENERGY_MARKERS = 12;
const MAX_SKILL_MARKERS = 8;
const DAMAGE_CUE_DURATION_MS = 3_000;

export interface RadarRect extends Rect {}
export interface RadarMarker extends Vec2 {
  id: string;
  kind: "local" | "teammate" | "enemy";
  color: string;
}

export interface RadarFrame {
  size: number;
  walls: RadarRect[];
  players: RadarMarker[];
  energy: Vec2[];
  skillOrbs: Array<Vec2 & { type: string }>;
  capturePoint: (Vec2 & { radius: number; state: string; ownerTeamId: string | null }) | null;
}

export type TacticalCueKind = "danger" | "objective" | "teammate";
export interface TacticalCue extends Vec2 {
  kind: TacticalCueKind;
  targetId: string;
  angle: number;
  distance: number;
  color: string;
}

export interface RecentDamageSource {
  attackerId: string | null;
  damagedAt: number | null;
}

export function projectRadarPoint(point: Vec2, size: number): Vec2 {
  return {
    x: clamp(point.x / ARENA_WIDTH * size, 0, size),
    y: clamp(point.y / ARENA_HEIGHT * size, 0, size),
  };
}

export function buildRadarFrame(snapshot: GameSnapshot, localPlayerId: string | null, size: number): RadarFrame {
  const map = getMapDefinition(snapshot.mapId ?? "reactor-core");
  const local = snapshot.players.find((player) => player.id === localPlayerId);
  const players = snapshot.players.filter((player) => shouldShowPlayerOnRadar(player, local, map.walls)).map((player) => ({
    id: player.id,
    ...projectRadarPoint(player, size),
    kind: player.id === local?.id ? "local" as const : isTeammate(player, local) ? "teammate" as const : "enemy" as const,
    color: player.color,
  }));
  return {
    size,
    walls: map.walls.map((wall) => ({
      x: wall.x / ARENA_WIDTH * size,
      y: wall.y / ARENA_HEIGHT * size,
      width: wall.width / ARENA_WIDTH * size,
      height: wall.height / ARENA_HEIGHT * size,
    })),
    players,
    energy: snapshot.energy.slice(0, MAX_ENERGY_MARKERS).map((orb) => projectRadarPoint(orb, size)),
    skillOrbs: snapshot.skillOrbs.slice(0, MAX_SKILL_MARKERS).map((orb) => ({ ...projectRadarPoint(orb, size), type: orb.type })),
    capturePoint: snapshot.capturePoint ? {
      ...projectRadarPoint(snapshot.capturePoint, size),
      radius: snapshot.capturePoint.radius / ARENA_WIDTH * size,
      state: snapshot.capturePoint.state,
      ownerTeamId: snapshot.capturePoint.ownerTeamId,
    } : null,
  };
}

export function projectOffscreenCue(target: Vec2, viewport: Rect, screen: { width: number; height: number }, inset: number): (Vec2 & { angle: number }) | null {
  if (target.x >= viewport.x && target.x <= viewport.x + viewport.width && target.y >= viewport.y && target.y <= viewport.y + viewport.height) return null;
  const targetScreen = {
    x: (target.x - viewport.x) / viewport.width * screen.width,
    y: (target.y - viewport.y) / viewport.height * screen.height,
  };
  const center = { x: screen.width / 2, y: screen.height / 2 };
  const delta = { x: targetScreen.x - center.x, y: targetScreen.y - center.y };
  const angle = Math.atan2(delta.y, delta.x);
  const scaleX = delta.x === 0 ? Number.POSITIVE_INFINITY : (delta.x > 0 ? screen.width - inset - center.x : inset - center.x) / delta.x;
  const scaleY = delta.y === 0 ? Number.POSITIVE_INFINITY : (delta.y > 0 ? screen.height - inset - center.y : inset - center.y) / delta.y;
  const scale = Math.max(0, Math.min(scaleX, scaleY));
  return { x: center.x + delta.x * scale, y: center.y + delta.y * scale, angle };
}

export function buildTacticalCues(
  snapshot: GameSnapshot,
  localPlayerId: string | null,
  viewport: Rect,
  screen: { width: number; height: number },
  damageSource: RecentDamageSource = { attackerId: null, damagedAt: null },
): TacticalCue[] {
  const local = snapshot.players.find((player) => player.id === localPlayerId);
  if (!local) return [];
  const candidates: Array<{ kind: TacticalCueKind; targetId: string; target: Vec2; color: string }> = [];
  if (damageSource.attackerId && damageSource.damagedAt !== null && snapshot.serverTime - damageSource.damagedAt <= DAMAGE_CUE_DURATION_MS) {
    const attacker = snapshot.players.find((player) => player.id === damageSource.attackerId && player.alive);
    if (attacker) candidates.push({ kind: "danger", targetId: attacker.id, target: attacker, color: attacker.color });
  }
  if (snapshot.capturePoint && (snapshot.capturePoint.state === "contested" || (snapshot.capturePoint.ownerTeamId !== null && snapshot.capturePoint.ownerTeamId !== local.teamId))) {
    candidates.push({ kind: "objective", targetId: "capture-point", target: snapshot.capturePoint, color: "#ffd166" });
  }
  const teammate = snapshot.players.filter((player) => player.id !== local.id && player.alive && isTeammate(player, local))
    .sort((left, right) => distanceSquared(local, left) - distanceSquared(local, right))[0];
  if (teammate) candidates.push({ kind: "teammate", targetId: teammate.id, target: teammate, color: teammate.color });

  const cues: TacticalCue[] = [];
  for (const candidate of candidates) {
    const projection = projectOffscreenCue(candidate.target, viewport, screen, 64);
    if (!projection) continue;
    cues.push({
      kind: candidate.kind,
      targetId: candidate.targetId,
      x: projection.x,
      y: projection.y,
      angle: projection.angle,
      distance: Math.round(Math.sqrt(distanceSquared(local, candidate.target))),
      color: candidate.color,
    });
    if (cues.length === 3) break;
  }
  return cues;
}

function shouldShowPlayerOnRadar(player: PlayerSnapshot, local: PlayerSnapshot | undefined, walls: readonly Rect[]): boolean {
  if (!local || !player.alive) return player.id === local?.id;
  if (player.id === local.id || isTeammate(player, local)) return true;
  const delta = { x: player.x - local.x, y: player.y - local.y };
  if (delta.x * delta.x + delta.y * delta.y > ENEMY_AWARENESS_RADIUS * ENEMY_AWARENESS_RADIUS) return false;
  return firstWallHit(local, delta, 0, walls) === null;
}

function isTeammate(player: PlayerSnapshot, local: PlayerSnapshot | undefined): boolean {
  return Boolean(local?.teamId && player.teamId === local.teamId);
}

function distanceSquared(left: Vec2, right: Vec2): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
