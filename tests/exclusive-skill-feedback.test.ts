import { describe, expect, it } from "vitest";

import {
  classifyExclusiveSkillFeedback,
  selectExclusiveSkillFeedback,
} from "../src/client/exclusive-skill-feedback";

const events = [
  {
    eventSeq: 4,
    serverTime: 10,
    playerId: "ally",
    skillId: "breach",
    stage: "cast",
    origin: { x: 0, y: 0 },
    target: { x: 1, y: 0 },
  },
  {
    eventSeq: 5,
    serverTime: 11,
    playerId: "ally",
    skillId: "breach",
    stage: "active",
    origin: { x: 10, y: 20 },
    target: { x: 30, y: 20 },
  },
] as const;

describe("exclusive skill feedback selection", () => {
  it("returns only events newer than the last consumed sequence", () => {
    const result = selectExclusiveSkillFeedback(events, 4);

    expect(result.events.map((event) => event.eventSeq)).toEqual([5]);
    expect(result.lastSequence).toBe(5);
    expect(result.events[0]).not.toBe(events[1]);
    expect(result.events[0]!.origin).not.toBe(events[1]!.origin);
  });

  it("baselines the first snapshot without replaying historical casts", () => {
    const result = selectExclusiveSkillFeedback([
      { ...events[0], eventSeq: 19 },
      { ...events[1], eventSeq: 20 },
    ], null);

    expect(result.events).toEqual([]);
    expect(result.lastSequence).toBe(20);
  });

  it("keeps a reconnect snapshot reconstructable without replaying its cast", () => {
    const snapshot = {
      events: [{ ...events[0], eventSeq: 30 }],
      activeState: { skillId: "breach" as const, startedAt: 10, expiresAt: 5_010 },
    };

    expect(selectExclusiveSkillFeedback(snapshot.events, null).events).toEqual([]);
    expect(snapshot.activeState).toMatchObject({ skillId: "breach", expiresAt: 5_010 });
  });

  it("classifies local, ally, and enemy feedback with source distance", () => {
    const players = [
      { id: "local", teamId: "red" as const, x: 100, y: 100 },
      { id: "ally", teamId: "red" as const, x: 150, y: 100 },
      { id: "enemy", teamId: "blue" as const, x: 300, y: 100 },
    ];

    expect(classifyExclusiveSkillFeedback({ ...events[0], playerId: "local", origin: { x: 100, y: 100 } }, "local", players)).toMatchObject({ relationship: "local", distance: 0 });
    expect(classifyExclusiveSkillFeedback({ ...events[0], origin: { x: 200, y: 100 } }, "local", players)).toMatchObject({ relationship: "ally", distance: 100 });
    expect(classifyExclusiveSkillFeedback({ ...events[0], playerId: "enemy", origin: { x: 400, y: 100 } }, "local", players)).toMatchObject({ relationship: "enemy", distance: 300 });
  });
});
