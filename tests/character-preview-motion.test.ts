import { describe, expect, it } from "vitest";

import { getCharacterPreviewMotion } from "../src/client/character-preview";

const characterIds = ["blaze", "medic", "fortress", "arc", "phase", "runner"] as const;

describe("six-character lobby preview motion", () => {
  it("gives every character the complete six-second transition timeline", () => {
    for (const id of characterIds) {
      const motion = getCharacterPreviewMotion(id);
      expect(motion).toMatchObject({ characterId: id, durationMs: 6_000 });
      expect(motion.primaryColor).toMatch(/^#/);
      expect(motion.accentColor).toMatch(/^#/);
      expect(motion.cssClass).toBe(`is-${id}`);
    }
  });
});
