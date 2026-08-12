export interface MetricSnapshot {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export class RollingMetric {
  private readonly samples: number[] = [];
  private nextIndex = 0;

  constructor(private readonly capacity = 600) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("capacity must be a positive integer");
  }

  add(value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.samples.length < this.capacity) {
      this.samples.push(value);
      return;
    }
    this.samples[this.nextIndex] = value;
    this.nextIndex = (this.nextIndex + 1) % this.capacity;
  }

  clear(): void {
    this.samples.length = 0;
    this.nextIndex = 0;
  }

  snapshot(): MetricSnapshot {
    if (this.samples.length === 0) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const sorted = [...this.samples].sort((left, right) => left - right);
    return {
      count: sorted.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      max: sorted[sorted.length - 1]!,
    };
  }
}

function percentile(sorted: readonly number[], rank: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * rank) - 1);
  return sorted[index] ?? 0;
}
