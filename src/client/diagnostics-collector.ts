import { DIAGNOSTIC_SCHEMA_VERSION, type ClientDiagnosticSample, type NetworkDiagnosticSummary } from "../shared/diagnostics";

const MAX_PENDING_INPUTS = 240;
const EMPTY_NETWORK: NetworkDiagnosticSummary = {
  effectiveType: null,
  downlinkMbps: null,
  estimatedRttMs: null,
  saveData: null,
};

export class ClientDiagnosticsCollector {
  private readonly frameSamples: number[] = [];
  private readonly correctionSamples: number[] = [];
  private readonly inputAckSamples: number[] = [];
  private readonly pendingInputs = new Map<number, number>();
  private rttMs: number | null = null;
  private hardCorrections = 0;
  private stalls = 0;
  private reconnects = 0;
  private connected = true;
  private network: NetworkDiagnosticSummary = { ...EMPTY_NETWORK };

  constructor(private readonly currentMatchId: () => string | null) {}

  get pendingInputCount(): number {
    return this.pendingInputs.size;
  }

  recordFrame(deltaMs: number): void {
    if (!validMetric(deltaMs)) return;
    this.frameSamples.push(deltaMs);
    if (deltaMs > 50) this.stalls += 1;
  }

  recordCorrection(distancePx: number, hard: boolean): void {
    if (!validMetric(distancePx)) return;
    this.correctionSamples.push(distancePx);
    if (hard) this.hardCorrections += 1;
  }

  recordInputSent(seq: number, atMs: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0 || !validMetric(atMs, Number.MAX_SAFE_INTEGER)) return;
    this.pendingInputs.set(seq, atMs);
    while (this.pendingInputs.size > MAX_PENDING_INPUTS) {
      const first = this.pendingInputs.keys().next().value as number | undefined;
      if (first === undefined) break;
      this.pendingInputs.delete(first);
    }
  }

  acknowledgeInputs(lastProcessedInput: number, atMs: number): void {
    if (!Number.isSafeInteger(lastProcessedInput) || lastProcessedInput < 0 || !validMetric(atMs, Number.MAX_SAFE_INTEGER)) return;
    for (const [seq, sentAt] of this.pendingInputs) {
      if (seq > lastProcessedInput) continue;
      this.inputAckSamples.push(Math.max(0, atMs - sentAt));
      this.pendingInputs.delete(seq);
    }
  }

  setRtt(rttMs: number | null): void {
    this.rttMs = rttMs !== null && validMetric(rttMs) ? rttMs : null;
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  recordReconnect(): void {
    this.reconnects += 1;
  }

  setNetwork(network: NetworkDiagnosticSummary): void {
    this.network = { ...network };
  }

  resetMatch(): void {
    this.pendingInputs.clear();
    this.clearWindow();
    this.reconnects = 0;
  }

  flush(sampledAt: number): ClientDiagnosticSample | null {
    const matchId = this.currentMatchId();
    if (!matchId) {
      this.clearWindow();
      return null;
    }
    const result: ClientDiagnosticSample = {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      matchId,
      sampledAt,
      rttMs: this.rttMs,
      inputAckP50Ms: percentile(this.inputAckSamples, 0.5),
      inputAckP95Ms: percentile(this.inputAckSamples, 0.95),
      inputAckMaxMs: maximum(this.inputAckSamples),
      frameP50Ms: percentile(this.frameSamples, 0.5),
      frameP95Ms: percentile(this.frameSamples, 0.95),
      frameMaxMs: maximum(this.frameSamples),
      correctionP95Px: percentile(this.correctionSamples, 0.95),
      correctionMaxPx: maximum(this.correctionSamples),
      hardCorrections: this.hardCorrections,
      stalls: this.stalls,
      pendingInputs: this.pendingInputs.size,
      reconnects: this.reconnects,
      connected: this.connected,
      network: { ...this.network },
    };
    this.clearWindow();
    return result;
  }

  private clearWindow(): void {
    this.frameSamples.length = 0;
    this.correctionSamples.length = 0;
    this.inputAckSamples.length = 0;
    this.hardCorrections = 0;
    this.stalls = 0;
  }
}

function validMetric(value: number, max = 60_000): boolean {
  return Number.isFinite(value) && value >= 0 && value <= max;
}

function percentile(values: readonly number[], rank: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * rank) - 1)] ?? null;
}

function maximum(values: readonly number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null;
}
