import { describe, expect, it } from "vitest";

import { RollingMetric } from "../src/server/performance";

describe("rolling performance metric", () => {
  it("returns zero percentiles before receiving samples", () => {
    expect(new RollingMetric().snapshot()).toEqual({ count: 0, p50: 0, p95: 0, p99: 0, max: 0 });
  });

  it("calculates deterministic nearest-rank percentiles", () => {
    const metric = new RollingMetric(100);
    for (let value = 1; value <= 100; value += 1) metric.add(value);

    expect(metric.snapshot()).toEqual({ count: 100, p50: 50, p95: 95, p99: 99, max: 100 });
  });

  it("keeps only the newest samples within capacity", () => {
    const metric = new RollingMetric(3);
    [1, 2, 3, 100].forEach((value) => metric.add(value));

    expect(metric.snapshot()).toEqual({ count: 3, p50: 3, p95: 100, p99: 100, max: 100 });
  });

  it("ignores non-finite samples", () => {
    const metric = new RollingMetric();
    metric.add(Number.NaN);
    metric.add(Number.POSITIVE_INFINITY);

    expect(metric.snapshot().count).toBe(0);
  });
});
