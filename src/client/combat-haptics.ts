import type { CombatFeedbackEvent, CombatFeedbackEventType } from "./combat-feedback";
import { mapMechanicVibrationPattern, type MapMechanicFeedbackEvent } from "./map-mechanic-visuals";

export type HapticsMode = "off" | "light" | "standard" | "strong";

export interface CombatHapticsOptions {
  vibrate?: (pattern: number | readonly number[]) => boolean;
  now?: () => number;
  mode?: HapticsMode;
  onFallback?: (type: CombatFeedbackEventType | "map-mechanic") => void;
}

const MAX_SEGMENT_MS = 120;
const MAX_PATTERN_MS = 300;
const THROTTLE_MS: Readonly<Partial<Record<CombatFeedbackEventType, number>>> = {
  hurt: 140,
  "low-health": 220,
  kill: 90,
};

function boundedPattern(pattern: readonly number[]): number[] {
  const bounded: number[] = [];
  let total = 0;
  for (const value of pattern) {
    const next = Math.max(0, Math.min(MAX_SEGMENT_MS, Math.round(value)));
    if (total + next > MAX_PATTERN_MS) break;
    bounded.push(next);
    total += next;
  }
  return bounded.length > 0 ? bounded : [0];
}

function scalePattern(pattern: readonly number[], mode: HapticsMode): number[] {
  const multiplier = mode === "light" ? 0.58 : mode === "strong" ? 1.22 : 1;
  return boundedPattern(pattern.map((value) => value * multiplier));
}

function basePattern(event: CombatFeedbackEvent): readonly number[] {
  switch (event.type) {
    case "hurt": return [65];
    case "low-health": return [90, 35, 90];
    case "death": return [110, 40, 110];
    case "kill": {
      const tier = Math.min(5, Math.max(1, Math.trunc(event.streak ?? 1)));
      return tier === 1 ? [35] : tier === 2 ? [35, 28, 45] : tier === 3 ? [45, 25, 65] : tier === 4 ? [55, 25, 80] : [65, 25, 100];
    }
  }
}

export class CombatHaptics {
  private readonly vibrate: ((pattern: number | readonly number[]) => boolean) | null;
  private readonly now: () => number;
  private readonly onFallback: (type: CombatFeedbackEventType | "map-mechanic") => void;
  private mode: HapticsMode;
  private readonly seenKeys = new Set<string>();
  private readonly lastAt = new Map<CombatFeedbackEventType, number>();

  constructor(options: CombatHapticsOptions = {}) {
    this.vibrate = options.vibrate ?? (typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
      ? ((pattern: number | readonly number[]) => navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]))
      : null);
    this.now = options.now ?? (() => performance.now());
    this.onFallback = options.onFallback ?? (() => {});
    this.mode = options.mode ?? "standard";
  }

  get currentMode(): HapticsMode {
    return this.mode;
  }

  setMode(mode: HapticsMode): void {
    this.mode = mode;
    if (mode === "off") this.stop();
  }

  handleEvents(events: readonly CombatFeedbackEvent[]): void {
    for (const event of events) {
      if (this.seenKeys.has(event.key)) continue;
      this.seenKeys.add(event.key);
      if (this.seenKeys.size > 256) this.seenKeys.delete(this.seenKeys.values().next().value as string);
      if (event.type === "death") this.stop();
      if (this.mode === "off") continue;
      const now = this.now();
      const last = this.lastAt.get(event.type) ?? -Infinity;
      const throttle = THROTTLE_MS[event.type] ?? 0;
      if (now - last < throttle) continue;
      this.lastAt.set(event.type, now);
      const pattern = scalePattern(basePattern(event), this.mode);
      if (this.vibrate) {
        try { this.vibrate(pattern); } catch { this.onFallback(event.type); }
      } else {
        this.onFallback(event.type);
      }
    }
  }

  handleMapMechanicEvent(event: MapMechanicFeedbackEvent): void {
    if (this.seenKeys.has(event.key)) return;
    this.seenKeys.add(event.key);
    if (this.seenKeys.size > 256) this.seenKeys.delete(this.seenKeys.values().next().value as string);
    if (this.mode === "off") return;
    const pattern = scalePattern(mapMechanicVibrationPattern(event.kind, event.stage), this.mode);
    if (this.vibrate) {
      try { this.vibrate(pattern); } catch { this.onFallback("map-mechanic"); }
    } else {
      this.onFallback("map-mechanic");
    }
  }

  stop(): void {
    try { this.vibrate?.(0); } catch { /* Unsupported implementations may throw. */ }
  }
}
