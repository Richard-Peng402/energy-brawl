import { describe, expect, it } from "vitest";
import { runV4LoadSimulation, validateV4LoadReport } from "../scripts/v4-load-test";

describe("v4 six-player load simulation", () => {
  it("keeps a 3v3 skill-heavy match wall-safe and within the server tick budget", () => {
    const report = runV4LoadSimulation(10);
    expect(validateV4LoadReport(report)).toEqual([]);
    expect(report.exclusiveSkillRequests).toBeGreaterThanOrEqual(6);
  });
});
