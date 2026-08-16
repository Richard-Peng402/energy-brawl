import { describe, expect, it } from "vitest";

import { appendPresentationEvent } from "../src/server/presentation-events";
import type { ExclusiveSkillEvent, ProjectileImpactEvent } from "../src/shared/protocol";

describe("bounded presentation events", () => {
  it("keeps only the newest event window with monotonic sequences", () => {
    const events: ExclusiveSkillEvent[] = [];
    for (let sequence = 1; sequence <= 40; sequence += 1) {
      appendPresentationEvent(events, {
        eventSeq: sequence,
        serverTime: sequence,
        playerId: "p1",
        skillId: "breach",
        stage: "cast",
        origin: { x: 10, y: 20 },
        target: { x: 30, y: 20 },
      }, 24);
    }

    expect(events).toHaveLength(24);
    expect(events[0]!.eventSeq).toBe(17);
    expect(events.at(-1)!.eventSeq).toBe(40);
  });

  it("accepts wall, player, and shield projectile impacts", () => {
    const events: ProjectileImpactEvent[] = [];
    for (const [index, kind] of ["wall", "player", "shield"].entries()) {
      appendPresentationEvent(events, {
        eventSeq: index + 1,
        serverTime: 100 + index,
        projectileId: `b${index}`,
        ownerId: "p1",
        targetId: kind === "wall" ? null : "p2",
        kind: kind as ProjectileImpactEvent["kind"],
        position: { x: 100, y: 200 },
      }, 32);
    }

    expect(events.map((event) => event.kind)).toEqual(["wall", "player", "shield"]);
  });
});
