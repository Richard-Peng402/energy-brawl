import { describe, expect, it } from "vitest";

import {
  combatDuckingMultiplier,
  createEnvironmentAudioState,
  readAudioMixSettings,
  updateEnvironmentAudio,
  writeAudioMixSettings,
} from "../src/client/environment-audio";

describe("map environment audio", () => {
  it("crossfades maps and ducks ambience during warnings", () => {
    const initial = createEnvironmentAudioState({ effects: 1, ambience: 0.8 });
    const reactor = updateEnvironmentAudio(initial, { mapId: "reactor-core", warning: false });
    expect(reactor.targetGain).toBeGreaterThan(0);
    const warning = updateEnvironmentAudio(reactor, { mapId: "reactor-core", warning: true });
    expect(warning.targetGain).toBeLessThan(reactor.targetGain * 0.5);
    const neon = updateEnvironmentAudio(warning, { mapId: "neon-docks", warning: false });
    expect(neon).toMatchObject({ activeMapId: "neon-docks", previousMapId: "reactor-core", warning: false });
  });

  it("keeps local critical feedback clear while ducking remote fire", () => {
    expect(combatDuckingMultiplier({ kind: "kill", local: true }, true)).toBe(1);
    expect(combatDuckingMultiplier({ kind: "exclusive-skill", local: true }, true)).toBe(1);
    expect(combatDuckingMultiplier({ kind: "fire", local: false }, true)).toBeLessThan(1);
    expect(combatDuckingMultiplier({ kind: "fire", local: false }, false)).toBe(1);
  });

  it("persists clamped effects and ambience levels with storage fallback", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writeAudioMixSettings(storage, { effects: 2, ambience: -1 });
    expect(readAudioMixSettings(storage)).toEqual({ effects: 1, ambience: 0 });
    expect(readAudioMixSettings({ getItem: () => { throw new Error("blocked"); } })).toEqual({ effects: 1, ambience: 0.65 });
  });
});
