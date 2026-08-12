import type { PlayerInput, PlayerSnapshot, Vec2 } from "../shared/protocol";
import type { MapId } from "../shared/map-catalog";
import { predictLocalPosition } from "./prediction";

export interface TimedInput {
  input: PlayerInput;
  deltaMs: number;
}

const HARD_CORRECTION_DISTANCE = 80;
export const MAX_PENDING_INPUTS = 240;

export function consumePositionCorrection(
  position: Vec2,
  remaining: Vec2,
  deltaMs: number,
  maxUnitsPerSecond = 30,
): { position: Vec2; remaining: Vec2 } {
  const distance = Math.hypot(remaining.x, remaining.y);
  if (distance <= 0 || !Number.isFinite(deltaMs) || deltaMs <= 0 || !Number.isFinite(maxUnitsPerSecond) || maxUnitsPerSecond <= 0) {
    return { position: { ...position }, remaining: { ...remaining } };
  }
  const amount = Math.min(distance, maxUnitsPerSecond * deltaMs / 1_000);
  const ratio = amount / distance;
  return {
    position: { x: position.x + remaining.x * ratio, y: position.y + remaining.y * ratio },
    remaining: { x: remaining.x * (1 - ratio), y: remaining.y * (1 - ratio) },
  };
}

export class InputReconciler {
  private readonly pending: TimedInput[] = [];
  private predictedPosition: Vec2 | null = null;
  hardCorrectionCount = 0;

  constructor(
    private readonly mapId: MapId = "reactor-core",
    private readonly observeCorrection: (distance: number, hard: boolean) => void = () => {},
  ) {}

  get pendingCount(): number {
    return this.pending.length;
  }

  add(input: PlayerInput, deltaMs: number): void {
    if (!Number.isSafeInteger(input.seq) || input.seq < 0 || !Number.isFinite(deltaMs) || deltaMs < 0) return;
    if (this.pending.length >= MAX_PENDING_INPUTS) {
      this.reset();
      return;
    }
    const duplicateIndex = this.pending.findIndex((entry) => entry.input.seq === input.seq);
    const entry = { input: { ...input }, deltaMs };
    if (duplicateIndex >= 0) this.pending[duplicateIndex] = entry;
    else this.pending.push(entry);
    this.pending.sort((left, right) => left.input.seq - right.input.seq);
  }

  reset(): void {
    this.pending.length = 0;
    this.predictedPosition = null;
  }

  reconcile(
    authoritative: PlayerSnapshot,
    currentPosition?: Vec2,
  ): { position: Vec2; correctionDistance: number } {
    while (this.pending[0] && this.pending[0].input.seq <= authoritative.lastProcessedInput) {
      this.pending.shift();
    }

    let position: Vec2 = { x: authoritative.x, y: authoritative.y };
    if (authoritative.alive) {
      for (const entry of this.pending) {
        position = predictLocalPosition(
          position,
          { x: entry.input.moveX, y: entry.input.moveY },
          entry.deltaMs,
          authoritative.moveSpeed,
          this.mapId,
        );
      }
    }

    const previous = currentPosition ?? this.predictedPosition ?? authoritative;
    const correctionDistance = Math.hypot(position.x - previous.x, position.y - previous.y);
    const hard = correctionDistance > HARD_CORRECTION_DISTANCE;
    if (hard) this.hardCorrectionCount += 1;
    this.observeCorrection(correctionDistance, hard);
    this.predictedPosition = position;
    return { position, correctionDistance };
  }
}
