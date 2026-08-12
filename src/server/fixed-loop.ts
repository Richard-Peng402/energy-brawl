export class FixedStepAccumulator {
  private accumulatorMs = 0;
  private lastNowMs: number | null = null;
  droppedMs = 0;
  catchUpLimitHits = 0;

  constructor(readonly stepMs: number, readonly maxCatchUpSteps = 3) {
    if (!Number.isFinite(stepMs) || stepMs <= 0) throw new Error("stepMs must be positive");
    if (!Number.isInteger(maxCatchUpSteps) || maxCatchUpSteps <= 0) {
      throw new Error("maxCatchUpSteps must be a positive integer");
    }
  }

  advance(nowMs: number, step: (deltaMs: number) => void): number {
    if (!Number.isFinite(nowMs)) return 0;
    if (this.lastNowMs === null) {
      this.lastNowMs = nowMs;
      return 0;
    }
    if (nowMs < this.lastNowMs) return 0;

    this.accumulatorMs += nowMs - this.lastNowMs;
    this.lastNowMs = nowMs;
    const availableSteps = Math.floor(this.accumulatorMs / this.stepMs + 1e-9);
    const producedSteps = Math.min(availableSteps, this.maxCatchUpSteps);
    for (let index = 0; index < producedSteps; index += 1) step(this.stepMs);
    this.accumulatorMs -= producedSteps * this.stepMs;

    const excessSteps = Math.floor(this.accumulatorMs / this.stepMs + 1e-9);
    if (excessSteps > 0) {
      this.catchUpLimitHits += 1;
      const dropped = excessSteps * this.stepMs;
      this.accumulatorMs -= dropped;
      this.droppedMs += dropped;
    }
    return producedSteps;
  }
}
