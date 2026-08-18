export const MATCH_MODES = ["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2", "teamElimination3v3"] as const;
export type MatchMode = typeof MATCH_MODES[number];

export const TEAM_IDS = ["red", "blue", "gold"] as const;
export type TeamId = typeof TEAM_IDS[number];

export interface ModeDefinition {
  id: MatchMode;
  name: string;
  teamCount: 0 | 2 | 3;
  teamSize: 1 | 2 | 3;
  targetScore: 0 | 4 | 20 | 40 | 60 | 100;
  objective: "score" | "capture" | "elimination";
}

export const MODE_CATALOG: Readonly<Record<MatchMode, ModeDefinition>> = {
  solo: { id: "solo", name: "个人战", teamCount: 0, teamSize: 1, targetScore: 20, objective: "score" },
  team3v3: { id: "team3v3", name: "3v3", teamCount: 2, teamSize: 3, targetScore: 60, objective: "score" },
  team2v2v2: { id: "team2v2v2", name: "2v2v2", teamCount: 3, teamSize: 2, targetScore: 40, objective: "score" },
  domination3v3: { id: "domination3v3", name: "据点 3v3", teamCount: 2, teamSize: 3, targetScore: 100, objective: "capture" },
  domination2v2v2: { id: "domination2v2v2", name: "据点 2v2v2", teamCount: 3, teamSize: 2, targetScore: 100, objective: "capture" },
  teamElimination3v3: { id: "teamElimination3v3", name: "团队歼灭 3v3", teamCount: 2, teamSize: 3, targetScore: 4, objective: "elimination" },
};

export function isCaptureMode(mode: MatchMode): boolean {
  return MODE_CATALOG[mode].objective === "capture";
}

export function getModeDefinition(mode: MatchMode): ModeDefinition {
  return MODE_CATALOG[mode];
}

export function isMatchMode(value: unknown): value is MatchMode {
  return typeof value === "string" && MATCH_MODES.includes(value as MatchMode);
}
