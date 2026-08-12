import { describe, expect, it } from "vitest";

import { PLAYER_RADIUS, PLAYER_SPEED } from "../src/shared/constants";
import type { PlayerSnapshot } from "../src/shared/protocol";
import { consumePositionCorrection, InputReconciler } from "../src/client/input-reconciliation";

describe("input reconciler", () => {
  it("drops acknowledged input and replays only newer input from the server position", () => {
    const reconciler = new InputReconciler();
    reconciler.add(input(1, 1, 0), 100);
    reconciler.add(input(2, 0, 1), 100);

    const result = reconciler.reconcile(player({ x: 300, y: 300, lastProcessedInput: 1 }));

    expect(result.position.x).toBeCloseTo(300);
    expect(result.position.y).toBeCloseTo(300 + PLAYER_SPEED * 0.1);
  });

  it("reports the distance between the previous prediction and corrected replay", () => {
    const reconciler = new InputReconciler();
    reconciler.reconcile(player({ x: 300, y: 300, lastProcessedInput: 0 }));
    reconciler.add(input(1, 1, 0), 100);

    const result = reconciler.reconcile(player({ x: 300, y: 300, lastProcessedInput: 0 }));

    expect(result.position.x).toBeCloseTo(300 + PLAYER_SPEED * 0.1);
    expect(result.correctionDistance).toBeCloseTo(PLAYER_SPEED * 0.1);
  });

  it("counts corrections larger than the hard correction threshold", () => {
    const reconciler = new InputReconciler();
    reconciler.reconcile(player({ x: 300, y: 300, lastProcessedInput: 0 }));

    const result = reconciler.reconcile(player({ x: 450, y: 300, lastProcessedInput: 0 }));

    expect(result.correctionDistance).toBe(150);
    expect(reconciler.hardCorrectionCount).toBe(1);
  });

  it("consumes small visible corrections at no more than thirty units per second", () => {
    const result = consumePositionCorrection(
      { x: 300, y: 300 },
      { x: 100, y: 0 },
      500,
    );

    expect(result.position).toEqual({ x: 315, y: 300 });
    expect(result.remaining).toEqual({ x: 85, y: 0 });
  });

  it("clears offline input before reconnect reconciliation", () => {
    const reconciler = new InputReconciler();
    reconciler.add(input(1, 1, 0), 100);

    reconciler.reset();
    const result = reconciler.reconcile(player({ x: 300, y: 300, lastProcessedInput: 0 }));

    expect(result.position).toEqual({ x: 300, y: 300 });
    expect(result.correctionDistance).toBe(0);
  });

  it("bounds pending input history when acknowledgements stop arriving", () => {
    const reconciler = new InputReconciler();
    for (let seq = 1; seq <= 241; seq += 1) reconciler.add(input(seq, 1, 0), 33);

    expect(reconciler.pendingCount).toBe(0);
  });

  it("replays pending input against the active map walls", () => {
    const reconciler = new InputReconciler("crystal-ruins");
    reconciler.add(input(1, 1, 0), 300);

    const result = reconciler.reconcile(player({ x: 1_200, y: 328, lastProcessedInput: 0 }));

    expect(result.position.x).toBeLessThanOrEqual(1_250 - PLAYER_RADIUS);
    expect(result.position.y).toBeCloseTo(328);
  });
});

function input(seq: number, moveX: number, moveY: number) {
  return { seq, moveX, moveY, aimX: 1, aimY: 0, firing: false };
}

function player(overrides: Partial<PlayerSnapshot>): PlayerSnapshot {
  return {
    id: "player-1",
    nickname: "Player",
    characterId: "blaze",
    color: "#ffffff",
    isBot: false,
    connected: true,
    ready: true,
    x: 300,
    y: 300,
    vx: 0,
    vy: 0,
    angle: 0,
    health: 100,
    maxHealth: 100,
    damage: 27,
    moveSpeed: PLAYER_SPEED,
    fireCooldownMs: 450,
    projectileSpeed: 620,
    score: 0,
    kills: 0,
    energyCollected: 0,
    alive: true,
    respawnAt: null,
    shieldUntil: 0,
    skillShieldHealth: 0,
    skillShieldUntil: 0,
    lastProcessedInput: 0,
    skillSlot: { type: null, charges: 0 },
    lastProcessedSkillAction: 0,
    teamId: null,
    ...overrides,
  };
}
