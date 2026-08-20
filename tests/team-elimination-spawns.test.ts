import { describe, expect, it } from "vitest";
import { getMapDefinition, MAP_CATALOG } from "../src/shared/map-catalog";
import { createGameWorld, resetWorldForEliminationRound } from "../src/server/simulation";
import type { PlayerSeed } from "../src/server/simulation";

const seeds: PlayerSeed[] = [
  { id: "red-1", nickname: "R1", characterId: "blaze", isBot: false, teamId: "red" },
  { id: "red-2", nickname: "R2", characterId: "medic", isBot: true, teamId: "red" },
  { id: "red-3", nickname: "R3", characterId: "fortress", isBot: true, teamId: "red" },
  { id: "blue-1", nickname: "B1", characterId: "arc", isBot: true, teamId: "blue" },
  { id: "blue-2", nickname: "B2", characterId: "phase", isBot: true, teamId: "blue" },
  { id: "blue-3", nickname: "B3", characterId: "runner", isBot: true, teamId: "blue" },
];

function xByTeam(world: ReturnType<typeof createGameWorld>, teamId: "red" | "blue"): number[] {
  return [...world.players.values()]
    .filter((player) => player.teamId === teamId)
    .map((player) => player.x)
    .sort((a, b) => a - b);
}

describe("team elimination round spawn sides", () => {
  it("swaps team spawn regions on round 2 and restores them on round 3 without changing identity or score", () => {
    const world = createGameWorld(seeds, 0, "teamElimination3v3", "neon-docks");
    const initialRed = xByTeam(world, "red");
    const initialBlue = xByTeam(world, "blue");
    expect(initialRed.every((x) => x < 1_440)).toBe(true);
    expect(initialBlue.every((x) => x > 1_440)).toBe(true);

    world.eliminationState!.roundIndex = 2;
    world.eliminationState!.scores = { red: 1, blue: 0 };
    resetWorldForEliminationRound(world, 4_000);
    expect(xByTeam(world, "red")).toEqual(initialBlue);
    expect(xByTeam(world, "blue")).toEqual(initialRed);
    expect(world.eliminationState!.scores).toEqual({ red: 1, blue: 0 });
    expect([...world.players.values()].map((player) => player.teamId)).toEqual(["red", "red", "red", "blue", "blue", "blue"]);

    world.eliminationState!.roundIndex = 3;
    resetWorldForEliminationRound(world, 8_000);
    expect(xByTeam(world, "red")).toEqual(initialRed);
    expect(xByTeam(world, "blue")).toEqual(initialBlue);
  });

  it("provides team elimination spawns for every map and keeps each point outside walls", () => {
    for (const map of MAP_CATALOG) {
      const points = map.spawnPointsByMode?.teamElimination3v3;
      expect(points, `${map.id} team elimination spawns`).toHaveLength(6);
      for (const point of points ?? []) {
        expect(map.walls.some((wall) => point.x >= wall.x && point.x <= wall.x + wall.width && point.y >= wall.y && point.y <= wall.y + wall.height)).toBe(false);
      }
      const world = createGameWorld(seeds, 0, "teamElimination3v3", map.id);
      expect([...world.players.values()].every((player) => player.teamId === "red" || player.teamId === "blue")).toBe(true);
      expect(getMapDefinition(map.id).spawnPointsByMode?.teamElimination3v3).toEqual(points);
    }
  });
});
