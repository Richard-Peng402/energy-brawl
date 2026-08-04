import { clamp } from "../shared/math";

export interface SnapshotSample<T> {
  older: T;
  newer: T;
  alpha: number;
}

export function shouldAdvanceSnapshotAnchor(previousServerTime: number | null, nextServerTime: number): boolean {
  return Number.isFinite(nextServerTime) && (previousServerTime === null || nextServerTime > previousServerTime);
}

export class SnapshotBuffer<T extends { serverTime: number }> {
  private readonly entries: T[] = [];

  constructor(private readonly maxEntries = 12) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) throw new Error("maxEntries must be a positive integer");
  }

  push(snapshot: T): void {
    if (!Number.isFinite(snapshot.serverTime)) return;
    const duplicateIndex = this.entries.findIndex((entry) => entry.serverTime === snapshot.serverTime);
    if (duplicateIndex >= 0) this.entries[duplicateIndex] = snapshot;
    else this.entries.push(snapshot);
    this.entries.sort((left, right) => left.serverTime - right.serverTime);
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  sample(renderServerTime: number): SnapshotSample<T> | null {
    if (this.entries.length === 0 || !Number.isFinite(renderServerTime)) return null;
    const first = this.entries[0]!;
    if (this.entries.length === 1 || renderServerTime <= first.serverTime) {
      return { older: first, newer: first, alpha: 0 };
    }

    for (let index = 1; index < this.entries.length; index += 1) {
      const newer = this.entries[index]!;
      if (renderServerTime > newer.serverTime) continue;
      const older = this.entries[index - 1]!;
      const duration = newer.serverTime - older.serverTime;
      const alpha = duration > 0 ? clamp((renderServerTime - older.serverTime) / duration, 0, 1) : 1;
      return { older, newer, alpha };
    }

    const newer = this.entries[this.entries.length - 1]!;
    const older = this.entries[this.entries.length - 2] ?? newer;
    return { older, newer, alpha: 1 };
  }
}
