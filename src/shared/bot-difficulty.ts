export type BotDifficulty = "easy" | "normal" | "hard";

export interface BotDifficultyProfile {
  reactionMinMs: number;
  reactionJitterMs: number;
  maxAimErrorRadians: number;
  fireRangeMultiplier: number;
  skillUseChance: number;
  eventAvoidanceMultiplier: number;
  allyProtectionMultiplier: number;
}

export const BOT_DIFFICULTY_PROFILES: Readonly<Record<BotDifficulty, BotDifficultyProfile>> = {
  easy: {
    reactionMinMs: 700,
    reactionJitterMs: 350,
    maxAimErrorRadians: 0.68,
    fireRangeMultiplier: 0.9,
    skillUseChance: 0.3,
    eventAvoidanceMultiplier: 0.85,
    allyProtectionMultiplier: 0.85,
  },
  normal: {
    reactionMinMs: 500,
    reactionJitterMs: 250,
    maxAimErrorRadians: 0.45,
    fireRangeMultiplier: 1,
    skillUseChance: 0.45,
    eventAvoidanceMultiplier: 1,
    allyProtectionMultiplier: 1,
  },
  hard: {
    reactionMinMs: 350,
    reactionJitterMs: 180,
    maxAimErrorRadians: 0.22,
    fireRangeMultiplier: 1.08,
    skillUseChance: 0.6,
    eventAvoidanceMultiplier: 1.15,
    allyProtectionMultiplier: 1.15,
  },
};

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

export function botDifficultyProfile(difficulty: BotDifficulty): BotDifficultyProfile {
  return BOT_DIFFICULTY_PROFILES[difficulty];
}
