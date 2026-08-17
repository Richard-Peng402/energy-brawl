import { describe, expect, it } from "vitest";

import { ARENA_HEIGHT, ARENA_WIDTH } from "../src/shared/constants";
import { zoneContainsPoint } from "../src/shared/map-mechanics";
import {
  applyPlayerInput,
  createGameWorld,
  finishWorldMatch,
  stepWorld,
  worldToSnapshot,
} from "../src/server/simulation";
import { GameRoom } from "../src/server/room";

function worldFor(seed: number) {
  return createGameWorld([
    { id: "p", nickname: "p", characterId: "blaze", isBot: false },
  ], 0, "solo", "reactor-core", { mapEventsEnabled: true, mapEventSeed: seed });
}

function activate(world: ReturnType<typeof worldFor>): void {
  const state = world.mapEventState!;
  state.phase = "active";
  state.phaseStartedAt = world.now;
  state.phaseEndsAt = world.now + 10_000;
}

describe("temporary map events in authoritative simulation", () => {
  it("lets the host disable events only in the lobby", () => {
    const room = new GameRoom();
    expect(room.snapshot().mapEventsEnabled).toBe(true);
    expect(room.applyHostAdminCommand({ type: "setMapEvents", enabled: false })).toEqual({ ok: true });
    expect(room.snapshot().mapEventsEnabled).toBe(false);
    room.joinHuman("socket", { nickname: "p", characterId: "blaze" });
    room.setReady("socket", true);
    room.startMatch();
    expect(room.gameWorld()!.mapEventState).toBeNull();
    expect(room.applyHostAdminCommand({ type: "setMapEvents", enabled: true })).toMatchObject({ ok: false });
  });

  it("supports disabled events and publishes warning snapshots when enabled", () => {
    const disabled = createGameWorld([{ id: "p", nickname: "p", characterId: "blaze", isBot: false }], 0, "solo", "reactor-core", { mapEventsEnabled: false });
    expect(disabled.mapEventState).toBeNull();
    expect(worldToSnapshot(disabled).mapEvent).toBeNull();

    const enabled = worldFor(0);
    stepWorld(enabled, 45_000);
    expect(worldToSnapshot(enabled).mapEvent).toMatchObject({ phase: "warning", kind: "supply-drop" });
  });

  it("clears transient event state when a match is forced to finish", () => {
    const world = worldFor(0);
    activate(world);
    world.mapEventState!.participantStartedAt.set("p", world.now);

    finishWorldMatch(world, ["p"]);

    expect(world.mapEventState).toBeNull();
    expect(worldToSnapshot(world).mapEvent).toBeNull();
  });

  it("grants one contested supply without adding score", () => {
    const world = worldFor(0);
    const player = world.players.get("p")!;
    activate(world);
    player.x = world.mapEventState!.point!.x;
    player.y = world.mapEventState!.point!.y;
    world.energy.clear();
    player.health = 50;
    const score = player.score;

    stepWorld(world, 1_001);
    expect(player.health).toBe(75);
    expect(player.score).toBe(score);
    expect(player.skillSlot.charges).toBe(1);
    expect(world.mapEventState!.phase).toBe("cooldown");
  });

  it("uses a soft lockdown with grace instead of adding collision walls", () => {
    const world = worldFor(1);
    const player = world.players.get("p")!;
    activate(world);
    const zone = world.mapEventState!.zone!;
    player.x = zone.kind === "rect" ? zone.x + zone.width / 2 : zone.x;
    player.y = zone.kind === "rect" ? zone.y + zone.height / 2 : zone.y;
    expect(zoneContainsPoint(zone, player)).toBe(true);
    const wallCount = world.mapWalls.query({ x: 0, y: 0, width: ARENA_WIDTH, height: ARENA_HEIGHT }).length;

    stepWorld(world, 1_900);
    expect(player.health).toBe(player.maxHealth);
    stepWorld(world, 1_100);
    expect(player.health).toBeLessThan(player.maxHealth);
    expect(world.mapWalls.query({ x: 0, y: 0, width: ARENA_WIDTH, height: ARENA_HEIGHT })).toHaveLength(wallCount);
  });

  it("reveals only recently active players during scan", () => {
    const world = worldFor(2);
    activate(world);
    applyPlayerInput(world, "p", { seq: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0, firing: false });
    stepWorld(world, 100);
    expect(world.mapEventState!.revealedPlayerIds.has("p")).toBe(true);
    applyPlayerInput(world, "p", { seq: 2, moveX: 0, moveY: 0, aimX: 1, aimY: 0, firing: false });
    stepWorld(world, 800);
    expect(world.mapEventState!.revealedPlayerIds.has("p")).toBe(false);
  });

  it("keeps storm damage nonlethal and creates no kill event", () => {
    const world = worldFor(3);
    const player = world.players.get("p")!;
    activate(world);
    player.x = 100;
    player.y = 810;
    player.health = 3;

    stepWorld(world, 1_001);
    expect(player.health).toBe(1);
    expect(player.alive).toBe(true);
    expect(player.deaths).toBe(0);
    expect(world.killFeed).toHaveLength(0);
  });
});
