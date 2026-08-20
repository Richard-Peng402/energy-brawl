export type NetworkHealthLevel = "good" | "unstable" | "poor" | "reconnecting";

export interface HeartbeatSample {
  sentAt: number;
  receivedAt: number | null;
}

export interface NetworkHealthSnapshot {
  rttMs: number | null;
  lossPercent: number;
  reconnects: number;
  level: NetworkHealthLevel;
}

export class NetworkHealth {
  private readonly samples: HeartbeatSample[] = [];
  private reconnectCount = 0;
  private reconnecting = false;

  constructor(private readonly options: { windowSize?: number } = {}) {}

  recordHeartbeat(sample: HeartbeatSample): void {
    this.samples.push({ ...sample });
    const limit = Math.max(1, Math.floor(this.options.windowSize ?? 20));
    while (this.samples.length > limit) this.samples.shift();
    this.reconnecting = false;
  }

  recordReconnect(): void {
    this.reconnectCount += 1;
  }

  setReconnecting(value: boolean): void {
    this.reconnecting = value;
  }

  snapshot(): NetworkHealthSnapshot {
    const received = this.samples
      .filter((sample) => sample.receivedAt !== null)
      .map((sample) => Math.max(0, sample.receivedAt! - sample.sentAt));
    const sorted = [...received].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const rttMs = sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[middle]!
        : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
    const lossPercent = this.samples.length === 0
      ? 0
      : Math.round(((this.samples.length - received.length) / this.samples.length) * 100);
    const level: NetworkHealthLevel = this.reconnecting
      ? "reconnecting"
      : rttMs === null || (rttMs <= 120 && lossPercent < 5)
        ? "good"
        : rttMs <= 250 || lossPercent < 15
          ? "unstable"
          : "poor";
    return { rttMs, lossPercent, reconnects: this.reconnectCount, level };
  }
}
