import { describe, expect, it } from "vitest";

import {
  CombatAudio,
  CombatAudioPolicy,
  killStreakAssetUrl,
  killStreakCue,
  mapMechanicAudioCue,
  readSoundMuted,
  soundPriority,
  writeSoundMuted,
} from "../src/client/combat-audio";

describe("v3.3 combat audio policy", () => {
  it("maps every kill streak to one of five natural-crystal audio assets", () => {
    expect([1, 2, 3, 4, 5].map(killStreakAssetUrl)).toEqual([
      "/assets/v3/audio/killstreak/kill-1.wav",
      "/assets/v3/audio/killstreak/kill-2.wav",
      "/assets/v3/audio/killstreak/kill-3.wav",
      "/assets/v3/audio/killstreak/kill-4.wav",
      "/assets/v3/audio/killstreak/kill-5.wav",
    ]);
    expect(killStreakAssetUrl(6)).toBe("/assets/v3/audio/killstreak/kill-5.wav");
    expect(killStreakAssetUrl(99)).toBe("/assets/v3/audio/killstreak/kill-5.wav");
    expect(killStreakAssetUrl(Number.NaN)).toBe("/assets/v3/audio/killstreak/kill-1.wav");
  });

  it("defines five distinct synthesized killstreak cues and clamps higher streaks to tier five", () => {
    const cues = [1, 2, 3, 4, 5].map(killStreakCue);
    expect(cues.map((cue) => cue.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(cues.map((cue) => JSON.stringify(cue.tones))).size).toBe(5);
    expect(cues[0]!.tones.some((tone) => tone.delay > 0)).toBe(true);
    expect(cues[1]!.tones[1]!.startFrequency).toBeGreaterThan(cues[1]!.tones[0]!.startFrequency);
    expect(cues[2]!.tones.some((tone) => tone.startFrequency <= 120)).toBe(true);
    expect(cues[3]!.tones.some((tone) => tone.type === "sawtooth")).toBe(true);
    expect(Math.max(...cues[4]!.tones.map((tone) => tone.delay + tone.duration))).toBeGreaterThan(0.5);
    expect(killStreakCue(6)).toEqual(cues[4]);
    expect(killStreakCue(99)).toEqual(cues[4]);
  });

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

  it("prioritizes local skill over remote fire but below local kill", () => {
    expect(soundPriority({ kind: "kill", local: true })).toBeGreaterThan(soundPriority({ kind: "exclusive-skill", local: true }));
    expect(soundPriority({ kind: "exclusive-skill", local: true })).toBeGreaterThan(soundPriority({ kind: "fire", local: false }));
  });

  it("clamps exclusive skill pan and distance gain", () => {
    const policy = new CombatAudioPolicy();
    policy.unlock();
    expect(policy.request({
      kind: "exclusive-skill",
      local: false,
      skillId: "phase-shift",
      skillStage: "cast",
      distance: 420,
      pan: 4,
    }, 1_000)).toMatchObject({ kind: "exclusive-skill", pan: 0.75 });
    expect(policy.request({
      kind: "exclusive-skill",
      local: false,
      skillId: "phase-shift",
      skillStage: "cast",
      distance: 99_000,
      pan: -4,
    }, 2_000)).toMatchObject({ gain: 0, pan: -0.75 });
  });

  it("approves objective feedback as a local combat cue", () => {
    const policy = new CombatAudioPolicy();
    policy.unlock();
    expect(policy.request({ kind: "objective", local: true, objectiveStage: "captured" }, 1_000)).toMatchObject({ kind: "objective", gain: 0.92 });
  });

  it("defines six distinct map-mechanic warning and activation cues", () => {
    const cues = (["reactor-vent", "neon-overdrive", "crystal-resonance"] as const)
      .flatMap((kind) => (["warning", "active"] as const).map((stage) => mapMechanicAudioCue(kind, stage)));
    expect(new Set(cues.map((cue) => JSON.stringify(cue.tones))).size).toBe(6);

    const policy = new CombatAudioPolicy();
    policy.unlock();
    expect(policy.request({ kind: "map-mechanic", local: true, mapMechanicKind: "neon-overdrive", mapMechanicStage: "active" }, 1_000))
      .toMatchObject({ kind: "map-mechanic", gain: 0.92, mapMechanicKind: "neon-overdrive", mapMechanicStage: "active" });
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

describe("iOS audio context unlock", () => {
  function makeContext() {
    const calls = {
      resume: 0,
      createBuffer: 0,
      createSource: 0,
      starts: 0,
      startedBuffers: [] as Array<AudioBuffer | null>,
      killGainValues: [] as number[],
      compressors: 0,
    };
    let state: AudioContextState = "suspended";
    const context = {
      get state() { return state; },
      sampleRate: 48_000,
      currentTime: 0,
      destination: {},
      resume: async () => { calls.resume += 1; state = "running"; },
      createBuffer: (_channels: number, length: number) => { calls.createBuffer += 1; return { getChannelData: () => new Float32Array(length) }; },
      createBufferSource: () => {
        calls.createSource += 1;
        let buffer: AudioBuffer | null = null;
        const source = {
          get buffer() { return buffer; },
          set buffer(value: AudioBuffer | null) { buffer = value; },
          onended: null as null | (() => void),
          connect: () => undefined,
          start: () => {
            calls.starts += 1;
            calls.startedBuffers.push(buffer);
            queueMicrotask(() => source.onended?.());
          },
          disconnect: () => undefined,
        };
        return source;
      },
      createOscillator: () => { throw new Error("not used"); },
      createGain: () => ({
        gain: { setValueAtTime: (value: number) => { calls.killGainValues.push(value); } },
        connect: () => undefined,
        disconnect: () => undefined,
      }),
      createDynamicsCompressor: () => {
        calls.compressors += 1;
        const parameter = { setValueAtTime: () => undefined };
        return {
          threshold: parameter,
          knee: parameter,
          ratio: parameter,
          attack: parameter,
          release: parameter,
          connect: () => undefined,
          disconnect: () => undefined,
        };
      },
    } as unknown as AudioContext;
    return { context, calls, suspend: () => { state = "suspended"; } };
  }

  it("primes a silent buffer on first unlock for iPhone Safari", async () => {
    const fake = makeContext();
    const audio = new CombatAudio({ getItem: () => null, setItem: () => undefined }, { audioContextFactory: () => fake.context });
    await audio.unlock();
    expect(fake.calls.resume).toBe(1);
    expect(fake.calls.createSource).toBe(1);
    expect(fake.calls.starts).toBe(1);
  });

  it("retries resume after Safari suspends the context without re-priming", async () => {
    const fake = makeContext();
    const audio = new CombatAudio({ getItem: () => null, setItem: () => undefined }, { audioContextFactory: () => fake.context });
    await audio.unlock();
    fake.suspend();
    await audio.unlock();
    expect(fake.calls.resume).toBe(2);
    expect(fake.calls.createSource).toBe(1);
  });

  it("preloads all five cues after unlock and plays the clamped WAV buffer", async () => {
    const fake = makeContext();
    const loadedUrls: string[] = [];
    const buffers = new Map<string, AudioBuffer>();
    const audio = new CombatAudio(
      { getItem: () => null, setItem: () => undefined },
      {
        audioContextFactory: () => fake.context,
        killBufferLoader: async (_context, url) => {
          loadedUrls.push(url);
          const buffer = { url } as unknown as AudioBuffer;
          buffers.set(url, buffer);
          return buffer;
        },
      },
    );

    await audio.unlock();
    await Promise.resolve();
    expect(loadedUrls).toEqual([1, 2, 3, 4, 5].map(killStreakAssetUrl));

    audio.playKillStreak(8);
    expect(fake.calls.startedBuffers.at(-1)).toBe(buffers.get(killStreakAssetUrl(5)));
    expect(fake.calls.killGainValues.at(-1)).toBeGreaterThan(1);
    expect(fake.calls.compressors).toBe(1);
  });
});
