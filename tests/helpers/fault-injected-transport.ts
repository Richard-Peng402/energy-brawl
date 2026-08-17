export interface FaultScheduleOptions {
  seed: number;
  packetLoss: number;
  minDelayMs: number;
  maxDelayMs: number;
  sendIntervalMs?: number;
}

export interface FaultScheduleEntry {
  sequence: number;
  sentAt: number;
  deliverAt: number;
  dropped: boolean;
}

export function createFaultSchedule(options: FaultScheduleOptions, count: number): FaultScheduleEntry[] {
  const random = xorshift32(options.seed);
  const minimum = Math.max(0, Math.floor(options.minDelayMs));
  const maximum = Math.max(minimum, Math.floor(options.maxDelayMs));
  const interval = Math.max(1, Math.floor(options.sendIntervalMs ?? 50));
  const loss = Math.max(0, Math.min(1, options.packetLoss));
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, sequence) => {
    const sentAt = sequence * interval;
    const dropped = random() < loss;
    const delay = minimum + Math.floor(random() * (maximum - minimum + 1));
    return { sequence, sentAt, deliverAt: sentAt + delay, dropped };
  });
}

function xorshift32(seed: number): () => number {
  let state = (Math.trunc(seed) || 0x6d2b79f5) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}
