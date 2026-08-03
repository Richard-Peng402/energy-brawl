import { describe, expect, it } from "vitest";

import {
  ENERGY_SCORE,
  MATCH_DURATION_MS,
  MAX_HEALTH,
  RESPAWN_DELAY_MS,
  SPAWN_SHIELD_MS,
  TARGET_SCORE,
} from "../src/shared/constants";
import {
  applyPlayerInput,
  collectEnergy,
  createGameWorld,
  damagePlayer,
  stepWorld,
} from "../src/server/simulation";

function createWorld() {
  return createGameWorld([
    { id: "red", nickname: "红方", color: "#ff5a5f", isBot: false },
    { id: "blue", nickname: "蓝方", color: "#4da3ff", isBot: false },
  ]);
}

describe("authoritative simulation", () => {
  it("awards three points for a defeat and respawns the victim", () => {
    const world = createWorld();
    stepWorld(world, SPAWN_SHIELD_MS + 1);

    damagePlayer(world, "blue", "red", MAX_HEALTH);

    expect(world.players.get("red")?.score).toBe(3);
    expect(world.players.get("red")?.kills).toBe(1);
    expect(world.players.get("blue")?.alive).toBe(false);

    stepWorld(world, RESPAWN_DELAY_MS + 1);

    expect(world.players.get("blue")?.alive).toBe(true);
    expect(world.players.get("blue")?.health).toBe(MAX_HEALTH);
  });

  it("collects energy and ends immediately at fifteen points", () => {
    const world = createWorld();
    const player = world.players.get("red")!;
    player.score = TARGET_SCORE - ENERGY_SCORE;
    const energyId = [...world.energy.keys()][0]!;

    collectEnergy(world, "red", energyId);

    expect(player.energyCollected).toBe(1);
    expect(player.score).toBe(TARGET_SCORE);
    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red"]);
  });

  it("enters overtime for tied leaders and ends on their next score", () => {
    const world = createWorld();
    world.players.get("red")!.score = 8;
    world.players.get("blue")!.score = 8;

    stepWorld(world, MATCH_DURATION_MS);

    expect(world.phase).toBe("overtime");
    expect(world.overtimePlayerIds.sort()).toEqual(["blue", "red"]);

    const energyId = [...world.energy.keys()][0]!;
    collectEnergy(world, "red", energyId);

    expect(world.phase).toBe("finished");
    expect(world.winnerIds).toEqual(["red"]);
  });

  it("normalizes movement input before applying speed", () => {
    const world = createWorld();
    const player = world.players.get("red")!;

    applyPlayerInput(world, "red", {
      seq: 1,
      moveX: 1,
      moveY: 1,
      aimX: 0,
      aimY: 0,
      firing: false,
    });
    stepWorld(world, 50);

    expect(Math.hypot(player.vx, player.vy)).toBeLessThanOrEqual(310.001);
    expect(player.lastProcessedInput).toBe(1);
  });
});
