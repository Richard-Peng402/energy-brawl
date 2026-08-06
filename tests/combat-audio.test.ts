import { describe, expect, it } from "vitest";

import { CombatAudio, CombatAudioPolicy, readSoundMuted, writeSoundMuted } from "../src/client/combat-audio";

describe("v3.3 combat audio policy", () => {
  it("stays silent before unlock and while muted", () => {
    const policy = new CombatAudioPolicy();
    expect(policy.request({ kind: "hurt", local: true }, 100)).toBeNull();
    policy.unlock();
    policy.setMuted(true);
    expect(policy.request({ kind: "hurt", local: true }, 200)).toBeNull();
  });

  it("rate limits remote fire per source but prioritizes local feedback", () => {
    const policy = new CombatAudioPolicy();
    policy.unlock();
    expect(policy.request({ kind: "fire", local: false, sourceId: "enemy", distance: 400 }, 1_000)?.gain).toBeLessThan(1);
    expect(policy.request({ kind: "fire", local: false, sourceId: "enemy", distance: 400 }, 1_080)).toBeNull();
    expect(policy.request({ kind: "hurt", local: true }, 1_080)).toMatchObject({ kind: "hurt", gain: 1 });
  });

  it("persists only the mute preference", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(readSoundMuted(storage)).toBe(false);
    writeSoundMuted(storage, true);
    expect(readSoundMuted(storage)).toBe(true);
  });

  it("toggles the shared mute state without requiring an audio context", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const audio = new CombatAudio(storage);
    expect(audio.isMuted).toBe(false);
    audio.toggleMuted();
    expect(audio.isMuted).toBe(true);
    expect(readSoundMuted(storage)).toBe(true);
  });

  it("tolerates unavailable browser storage", () => {
    const storage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readSoundMuted(storage)).toBe(false);
    expect(() => writeSoundMuted(storage, true)).not.toThrow();
  });
});
