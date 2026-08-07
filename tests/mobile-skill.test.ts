import { describe, expect, it } from "vitest";

import type { PlayerSnapshot } from "../src/shared/protocol";
import { skillUseBlockReason } from "../src/client/skill-use";

const player = (overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: "player-1", nickname: "玩家", characterId: "medic", color: "#31d0aa", isBot: false, connected: true, ready: true,
  x: 100, y: 100, vx: 0, vy: 0, angle: 0, health: 100, maxHealth: 100, damage: 23, moveSpeed: 250,
  fireCooldownMs: 480, projectileSpeed: 600, score: 0, kills: 0, energyCollected: 0, alive: true, respawnAt: null,
  shieldUntil: 0, skillShieldHealth: 0, skillShieldUntil: 0, lastProcessedInput: 0,
  skillSlot: { type: "heal", charges: 1 }, lastProcessedSkillAction: 0,
  ...overrides,
});

describe("mobile skill feedback", () => {
  it("blocks a healing action at full health with a clear reason", () => {
    expect(skillUseBlockReason(player())).toBe("生命已满");
    expect(skillUseBlockReason(player({ health: 80 }))).toBeNull();
    expect(skillUseBlockReason(player({ skillSlot: { type: null, charges: 0 } }))).toBe("技能槽为空");
  });
});
