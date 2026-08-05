import type { CharacterId } from "../shared/character-catalog";
import type { CharacterAssetState } from "./asset-registry";

export type CharacterRuntimeTextureState = CharacterAssetState | "generated-fallback";
export type CombatEffectKind = "muzzle" | "trail" | "hit" | "shield" | "dash" | "heal" | "respawn";
export type RenderEffectKind = CombatEffectKind | "environment";
export type CharacterVisualState = "idle" | "move" | "attack" | "hit" | "death";

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

export function characterTextureKey(id: CharacterId, state: CharacterRuntimeTextureState): string {
  return `character:${id}:${state}`;
}

export function resolveCharacterTextureKey(
  id: CharacterId,
  state: CharacterAssetState,
  failedTextureKeys: ReadonlySet<string>,
): string {
  const requested = characterTextureKey(id, state);
  return failedTextureKeys.has(requested) ? characterTextureKey(id, "generated-fallback") : requested;
}

export function deriveCharacterVisualState(signals: CharacterVisualSignals, now: number): CharacterVisualState {
  if (!signals.alive) return "death";
  if (signals.hitUntil > now) return "hit";
  if (signals.attackUntil > now) return "attack";
  return signals.speed > 8 ? "move" : "idle";
}

export function shouldRenderEffect(effect: RenderEffectKind, lowPerformance: boolean): boolean {
  return effect !== "environment" || !lowPerformance;
}
