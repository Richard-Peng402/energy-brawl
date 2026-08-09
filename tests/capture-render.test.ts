import { describe, expect, it } from "vitest";

import type { GameSnapshot } from "../src/shared/protocol";

describe("capture point presentation contract", () => {
  it("contains a server-authored central point and contest state", () => {
    const snapshot: Pick<GameSnapshot, "capturePoint"> = {
      capturePoint: {
        x: 1_440,
        y: 810,
        radius: 220,
        ownerTeamId: "red",
        progress: 50,
        targetProgress: 100,
        contestingTeams: ["red", "blue"],
        state: "contested",
      },
    };
    expect(snapshot.capturePoint?.state).toBe("contested");
    expect(snapshot.capturePoint?.contestingTeams).toContain("blue");
  });
});
