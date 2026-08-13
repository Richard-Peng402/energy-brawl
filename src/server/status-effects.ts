export type StatusEffectId = "bulwark-suppression" | "phase-reveal" | "phase-fire-lock";

export interface StatusEffect {
  id: StatusEffectId;
  startedAt: number;
  expiresAt: number;
  purifiable: boolean;
}

export type StatusEffectStore = Map<StatusEffectId, StatusEffect>;

const PURIFIABLE: ReadonlySet<StatusEffectId> = new Set(["bulwark-suppression"]);

export function addStatusEffect(store: StatusEffectStore, id: StatusEffectId, now: number, durationMs: number): StatusEffect {
  const existing = store.get(id);
  const effect: StatusEffect = {
    id,
    startedAt: now,
    expiresAt: now + Math.max(0, durationMs),
    purifiable: PURIFIABLE.has(id),
  };
  if (existing && existing.expiresAt > now) effect.expiresAt = Math.max(existing.expiresAt, effect.expiresAt);
  store.set(id, effect);
  return effect;
}

export function hasActiveStatusEffect(store: StatusEffectStore, id: StatusEffectId, now: number): boolean {
  const effect = store.get(id);
  return Boolean(effect && effect.expiresAt > now);
}

export function expireStatusEffects(store: StatusEffectStore, now: number): void {
  for (const [id, effect] of store) if (effect.expiresAt <= now) store.delete(id);
}

export function clearPurifiableStatus(store: StatusEffectStore): StatusEffectId[] {
  const cleared: StatusEffectId[] = [];
  for (const [id, effect] of store) {
    if (!effect.purifiable) continue;
    store.delete(id);
    cleared.push(id);
  }
  return cleared;
}

export function clearAllStatusEffects(store: StatusEffectStore): void {
  store.clear();
}
