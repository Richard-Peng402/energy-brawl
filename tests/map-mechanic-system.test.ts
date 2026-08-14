import { describe, expect, it } from "vitest";

import {
  advanceMapMechanicState,
  createMapMechanicState,
  mapMechanicSnapshot,
  updateCrystalParticipant,
} from "../src/server/map-mechanic-system";

describe("map mechanic lifecycle", () => {
  it("advances at exact phase boundaries and alternates neon lanes", () => {
    const state = createMapMechanicState("neon-docks", 1_000, true)!;

    expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "idle", phaseEndsAt: 21_000, round: 0, zoneIndex: 0 });
    advanceMapMechanicState(state, 20_999, true);
    expect(mapMechanicSnapshot(state).phase).toBe("idle");
    advanceMapMechanicState(state, 21_000, true);
    expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "warning", phaseStartedAt: 21_000, phaseEndsAt: 25_000, zoneIndex: 0 });
    advanceMapMechanicState(state, 25_000, true);
    expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "active", phaseStartedAt: 25_000, phaseEndsAt: 33_000 });
    advanceMapMechanicState(state, 33_000, true);
    expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "cooldown", phaseStartedAt: 33_000, phaseEndsAt: 53_000 });
    advanceMapMechanicState(state, 53_000, true);
    expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "warning", round: 1, zoneIndex: 1, phaseEndsAt: 57_000 });
  });

  it("catches up deterministically after one large clock jump", () => {
    const state = createMapMechanicState("neon-docks", 1_000, true)!;

    advanceMapMechanicState(state, 90_000, true);

    expect(mapMechanicSnapshot(state)).toMatchObject({
      phase: "active",
      round: 2,
      zoneIndex: 0,
      phaseStartedAt: 89_000,
      phaseEndsAt: 97_000,
    });
  });

  it("returns no state when disabled", () => {
    expect(createMapMechanicState("reactor-core", 0, false)).toBeNull();
  });

  it("finishes an existing event but does not create a new event in overtime", () => {
    const idle = createMapMechanicState("reactor-core", 1_000, true)!;
    advanceMapMechanicState(idle, 21_000, false);
    expect(mapMechanicSnapshot(idle)).toMatchObject({ phase: "idle", phaseEndsAt: Number.POSITIVE_INFINITY });

    const active = createMapMechanicState("reactor-core", 1_000, true)!;
    advanceMapMechanicState(active, 25_000, true);
    expect(active.phase).toBe("active");
    advanceMapMechanicState(active, 60_000, false);
    expect(mapMechanicSnapshot(active)).toMatchObject({ phase: "cooldown", phaseEndsAt: Number.POSITIVE_INFINITY });
  });

  it("clears round-local participant and damage state after active ends", () => {
    const state = createMapMechanicState("crystal-ruins", 0, true)!;
    advanceMapMechanicState(state, 24_000, true);
    state.participantChargeStartedAt.set("p1", 20_000);
    state.claimedPlayerIds.add("p1");
    state.reactorDamageAt.set("p1", 24_000);

    advanceMapMechanicState(state, 32_000, true);

    expect(state.phase).toBe("cooldown");
    expect(state.participantChargeStartedAt.size).toBe(0);
    expect(state.claimedPlayerIds.size).toBe(0);
    expect(state.reactorDamageAt.size).toBe(0);
  });
});

describe("crystal resonance participation", () => {
  it("requires uninterrupted residence and grants only once per active round", () => {
    const state = createMapMechanicState("crystal-ruins", 0, true)!;
    advanceMapMechanicState(state, 24_000, true);

    expect(updateCrystalParticipant(state, "p1", true, 24_000)).toBe(false);
    expect(updateCrystalParticipant(state, "p1", true, 25_249)).toBe(false);
    expect(mapMechanicSnapshot(state).participants).toEqual([{ playerId: "p1", chargeProgress: 0.9992, claimed: false }]);
    expect(updateCrystalParticipant(state, "p1", false, 25_249)).toBe(false);
    expect(mapMechanicSnapshot(state).participants).toEqual([]);

    expect(updateCrystalParticipant(state, "p1", true, 25_300)).toBe(false);
    expect(updateCrystalParticipant(state, "p1", true, 26_550)).toBe(true);
    expect(updateCrystalParticipant(state, "p1", true, 26_900)).toBe(false);
    expect(mapMechanicSnapshot(state).participants).toEqual([{ playerId: "p1", chargeProgress: 1, claimed: true }]);
  });

  it("does not charge outside an active crystal phase", () => {
    const crystal = createMapMechanicState("crystal-ruins", 0, true)!;
    const neon = createMapMechanicState("neon-docks", 0, true)!;

    expect(updateCrystalParticipant(crystal, "p1", true, 1_000)).toBe(false);
    expect(updateCrystalParticipant(neon, "p1", true, 25_000)).toBe(false);
    expect(crystal.participantChargeStartedAt.size).toBe(0);
    expect(neon.participantChargeStartedAt.size).toBe(0);
  });
});
