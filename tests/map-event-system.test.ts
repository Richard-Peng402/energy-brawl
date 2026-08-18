import { describe, expect, it } from "vitest";

import {
  advanceMapEventState,
  createMapEventState,
  mapEventSnapshot,
} from "../src/server/map-event-system";

const open = { mapMechanicBusy: false, allowNewEvent: true } as const;

describe("temporary map event state machine", () => {
  it("returns no state when events are disabled", () => {
    expect(createMapEventState("reactor-core", 0, false, 1)).toBeNull();
  });

  it("advances warning, active, cooldown, and rotates event kind", () => {
    const state = createMapEventState("reactor-core", 0, true, 1)!;
    expect(state.phase).toBe("idle");
    expect(state.phaseEndsAt).toBe(45_000);

    advanceMapEventState(state, 45_000, open);
    expect(state.phase).toBe("warning");
    const firstKind = state.kind;
    const warningEnd = state.phaseEndsAt;

    advanceMapEventState(state, warningEnd, open);
    expect(state.phase).toBe("active");
    advanceMapEventState(state, state.phaseEndsAt, open);
    expect(state.phase).toBe("cooldown");
    advanceMapEventState(state, state.phaseEndsAt, open);
    expect(state.phase).toBe("warning");
    expect(state.kind).not.toBe(firstKind);
    expect(state.round).toBe(1);
  });

  it("defers a new warning until three seconds after a busy map mechanic", () => {
    const state = createMapEventState("neon-docks", 0, true, 7)!;
    advanceMapEventState(state, 45_000, { mapMechanicBusy: true, allowNewEvent: true });
    expect(state.phase).toBe("idle");
    expect(state.phaseEndsAt).toBe(48_000);
    advanceMapEventState(state, 48_000, open);
    expect(state.phase).toBe("warning");
  });

  it("stops scheduling and clears round state when the match cannot start another event", () => {
    const state = createMapEventState("crystal-ruins", 0, true, 2)!;
    state.participantStartedAt.set("p", 1);
    state.claimedPlayerIds.add("p");
    advanceMapEventState(state, 45_000, { mapMechanicBusy: false, allowNewEvent: false });
    expect(state.phase).toBe("idle");
    expect(state.phaseEndsAt).toBe(Number.POSITIVE_INFINITY);
    expect(state.participantStartedAt.size).toBe(0);
    expect(state.claimedPlayerIds.size).toBe(0);
  });

  it("limits elimination rounds to one temporary event", () => {
    const state = createMapEventState("reactor-core", 0, true, 1)!;
    const onePerRound = { mapMechanicBusy: false, allowNewEvent: true, maxEvents: 1 } as const;
    advanceMapEventState(state, 45_000, onePerRound);
    advanceMapEventState(state, state.phaseEndsAt, onePerRound);
    advanceMapEventState(state, state.phaseEndsAt, onePerRound);
    advanceMapEventState(state, state.phaseEndsAt, onePerRound);
    expect(state.eventSeq).toBe(1);
    expect(state.phase).toBe("idle");
    expect(state.phaseEndsAt).toBe(Number.POSITIVE_INFINITY);
  });

  it("serializes copied participant data and selected geometry", () => {
    const state = createMapEventState("reactor-core", 0, true, 0)!;
    advanceMapEventState(state, 45_000, open);
    state.participantStartedAt.set("p", state.phaseStartedAt);
    const snapshot = mapEventSnapshot(state);
    expect(snapshot.eventSeq).toBe(1);
    expect(snapshot.zone ?? snapshot.point).not.toBeNull();
    expect(snapshot.participants).toEqual([{ playerId: "p", progress: 0 }]);
    state.participantStartedAt.clear();
    expect(snapshot.participants).toHaveLength(1);
  });
});
