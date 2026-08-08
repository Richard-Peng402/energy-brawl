import { describe, expect, it } from "vitest";

import { assignBalancedTeams, hasDuplicateCharacterOnTeam, swapTeams, teamSizes } from "../src/server/team-system";
import type { CharacterId } from "../src/shared/character-catalog";
import type { TeamId } from "../src/shared/mode-catalog";

interface Seat {
  id: string;
  characterId: CharacterId;
  isBot: boolean;
  teamId: TeamId | null;
}

const seats = (count: number): Seat[] => Array.from({ length: count }, (_, index) => ({
  id: `p${index + 1}`,
  characterId: (["blaze", "medic", "fortress", "arc", "phase", "runner"] as CharacterId[])[index]!,
  isBot: index >= 3,
  teamId: null,
}));

describe("v4 team system", () => {
  it("assigns deterministic balanced teams for 3v3 and 2v2v2", () => {
    const three = seats(6);
    assignBalancedTeams(three, "team3v3");
    expect(teamSizes(three)).toEqual({ red: 3, blue: 3 });
    expect(three.map((seat) => seat.teamId)).toEqual(["red", "blue", "red", "blue", "red", "blue"]);

    const two = seats(6);
    assignBalancedTeams(two, "team2v2v2");
    expect(teamSizes(two)).toEqual({ red: 2, blue: 2, gold: 2 });
  });

  it("clears teams for solo and swaps two existing team assignments", () => {
    const players = seats(6);
    assignBalancedTeams(players, "team3v3");
    expect(swapTeams(players, "p1", "p2")).toBe(true);
    expect(players[0]?.teamId).toBe("blue");
    expect(players[1]?.teamId).toBe("red");
    assignBalancedTeams(players, "solo");
    expect(players.every((seat) => seat.teamId === null)).toBe(true);
  });

  it("finds duplicate characters only within the same team", () => {
    const players = seats(4);
    assignBalancedTeams(players, "team3v3");
    players[2]!.characterId = players[0]!.characterId;
    expect(hasDuplicateCharacterOnTeam(players)).toBe(true);
    players[2]!.teamId = "blue";
    expect(hasDuplicateCharacterOnTeam(players)).toBe(false);
  });

  it("keeps duplicate character picks on different teams when balancing", () => {
    const players = seats(2);
    players[0]!.characterId = "blaze";
    players[1]!.characterId = "blaze";

    assignBalancedTeams(players, "team3v3");

    expect(players.map((seat) => seat.teamId)).toEqual(["red", "blue"]);
    expect(hasDuplicateCharacterOnTeam(players)).toBe(false);
  });
});
