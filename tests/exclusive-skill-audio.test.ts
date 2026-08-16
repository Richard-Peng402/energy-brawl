import { describe, expect, it } from "vitest";

import { getExclusiveSkillAudioProfile } from "../src/client/exclusive-skill-audio";
import { EXCLUSIVE_SKILL_IDS } from "../src/shared/exclusive-skill-catalog";

describe("exclusive skill audio identities", () => {
  it("defines distinct cast, active, and end cues for all six skills", () => {
    const serialized = EXCLUSIVE_SKILL_IDS.flatMap((id) =>
      (["cast", "active", "end"] as const).map((stage) => JSON.stringify(getExclusiveSkillAudioProfile(id, stage))),
    );
    expect(new Set(serialized).size).toBe(serialized.length);
  });

  it("keeps every cue bounded and end cues below cast priority", () => {
    for (const skillId of EXCLUSIVE_SKILL_IDS) {
      const cast = getExclusiveSkillAudioProfile(skillId, "cast");
      const active = getExclusiveSkillAudioProfile(skillId, "active");
      const end = getExclusiveSkillAudioProfile(skillId, "end");
      expect(cast.sampleUrl).toContain(`/exclusive-skills/${skillId}/cast.`);
      expect(cast.fallbackTones.length).toBeGreaterThan(0);
      expect(end.priority).toBeLessThan(cast.priority);
      expect([cast, active, end].every((profile) => profile.gain > 0 && profile.gain <= 1)).toBe(true);
      expect([cast, active, end].every((profile) => profile.maxDurationMs <= 1_200)).toBe(true);
      expect([cast, end].every((profile) => profile.loop === false)).toBe(true);
    }
  });
});
