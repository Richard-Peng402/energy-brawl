import type { CharacterId } from "../shared/character-catalog";
import type { CharacterAssetState, CharacterDirection } from "./asset-registry";

export type CharacterRuntimeTextureState = CharacterAssetState | "generated-fallback";
export type CharacterWeaponKind = "cyan-heavy" | "violet-rifle" | "white-tech" | "ember-cannon";
export type CombatEffectKind =
  | "muzzle" | "trail" | "impact" | "spark"
  | "hit" | "shield" | "dash" | "heal" | "respawn";
export type RenderEffectKind = CombatEffectKind | "environment";
export type CharacterVisualState = "idle" | "move" | "attack" | "hit" | "death";

export const PLAYER_CHILD_LAYER_ORDER = [
  "shadow",
  "ring",
  "sprite",
  "weapon",
  "aim",
  "health-bg",
  "health-fill",
  "name",
] as const;
export type PlayerChildLayer = typeof PLAYER_CHILD_LAYER_ORDER[number];

export function getPlayerChildLayerOrder(): readonly PlayerChildLayer[] {
  return PLAYER_CHILD_LAYER_ORDER;
}

export interface WeaponTransform {
  x: number;
  y: number;
  rotation: number;
}

export function resolveWeaponTransform(angle: number, distance: number): WeaponTransform {
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    rotation: angle,
  };
}

export interface CharacterVisualSignals {
  alive: boolean;
  speed: number;
  attackUntil: number;
  hitUntil: number;
}

export class FixedObjectPool<T> {
  readonly capacity: number;
  private readonly items: T[];
  private cursor = 0;

  constructor(capacity: number, create: (index: number) => T, private readonly reset: (item: T) => void) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("Pool capacity must be a positive integer");
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, (_, index) => create(index));
  }

  acquire(configure?: (item: T) => void): T {
    const item = this.items[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.reset(item);
    configure?.(item);
    return item;
  }

  forEach(visitor: (item: T, index: number) => void): void {
    this.items.forEach(visitor);
  }
}

export class ReusableObjectPool<T extends object> {
  readonly capacity: number;
  private readonly items: T[];
  private readonly indices = new Map<T, number>();
  private readonly leased = new Set<number>();
  private readonly free: number[];

  constructor(capacity: number, create: (index: number) => T, private readonly reset: (item: T) => void) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("Pool capacity must be a positive integer");
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, (_, index) => create(index));
    this.items.forEach((item, index) => this.indices.set(item, index));
    this.free = Array.from({ length: capacity }, (_, index) => capacity - index - 1);
  }

  acquire(configure?: (item: T) => void): T | null {
    const index = this.free.pop();
    if (index === undefined) return null;
    const item = this.items[index]!;
    this.leased.add(index);
    this.reset(item);
    configure?.(item);
    return item;
  }

  release(item: T): boolean {
    const index = this.indices.get(item);
    if (index === undefined || !this.leased.delete(index)) return false;
    this.reset(item);
    this.free.push(index);
    return true;
  }
}

export function characterTextureKey(id: CharacterId, state: CharacterRuntimeTextureState): string {
  return `character:${id}:${state}`;
}

export function characterWeaponKind(id: CharacterId): CharacterWeaponKind {
  const mapping: Record<CharacterId, CharacterWeaponKind> = {
    blaze: "ember-cannon",
    medic: "cyan-heavy",
    fortress: "white-tech",
    arc: "violet-rifle",
    phase: "cyan-heavy",
    runner: "ember-cannon",
  };
  return mapping[id];
}

export function weaponTextureKey(kind: CharacterWeaponKind): string {
  return `weapon:${kind}`;
}

const ANGLE_DIRECTIONS: readonly CharacterDirection[] = [
  "right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right",
];

export function characterDirectionFromAngle(angle: number): CharacterDirection {
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return ANGLE_DIRECTIONS[Math.round(normalized / (Math.PI / 4)) % 8]!;
}

export function characterDirectionTextureKey(id: CharacterId, direction: CharacterDirection): string {
  return `character:${id}:direction:${direction}`;
}

export function resolveCharacterTextureKey(
  id: CharacterId,
  state: CharacterAssetState,
  failedTextureKeys: ReadonlySet<string>,
): string {
  const requested = characterTextureKey(id, state);
  return failedTextureKeys.has(requested) ? characterTextureKey(id, "generated-fallback") : requested;
}

export function resolveCharacterDirectionTextureKey(
  id: CharacterId,
  direction: CharacterDirection,
  state: CharacterAssetState,
  failedTextureKeys: ReadonlySet<string>,
): string {
  const directional = characterDirectionTextureKey(id, direction);
  return failedTextureKeys.has(directional)
    ? resolveCharacterTextureKey(id, state, failedTextureKeys)
    : directional;
}

export function deriveCharacterVisualState(signals: CharacterVisualSignals, now: number): CharacterVisualState {
  if (!signals.alive) return "death";
  if (signals.hitUntil > now) return "hit";
  if (signals.attackUntil > now) return "attack";
  return signals.speed > 8 ? "move" : "idle";
}

export function shouldRenderEffect(effect: RenderEffectKind, lowPerformance: boolean): boolean {
  return !lowPerformance || (effect !== "environment" && effect !== "spark");
}
