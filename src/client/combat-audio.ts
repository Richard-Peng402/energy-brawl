export type CombatSoundKind = "fire" | "impact" | "hurt" | "pickup" | "kill" | "objective";
export type ObjectiveSoundStage = "capture-start" | "contested" | "captured" | "overtime" | "finish";

export interface CombatSoundRequest {
  kind: CombatSoundKind;
  local: boolean;
  sourceId?: string;
  distance?: number;
  streak?: number;
  objectiveStage?: ObjectiveSoundStage;
}

export interface ApprovedCombatSound {
  kind: CombatSoundKind;
  gain: number;
  streak?: number;
  objectiveStage?: ObjectiveSoundStage;
}

export type KillStreakTier = 1 | 2 | 3 | 4 | 5;

export interface SynthTone {
  type: OscillatorType;
  startFrequency: number;
  endFrequency: number;
  duration: number;
  volume: number;
  delay: number;
}

export interface KillStreakCue {
  tier: KillStreakTier;
  tones: readonly SynthTone[];
}

const KILL_STREAK_CUES: Readonly<Record<KillStreakTier, KillStreakCue>> = {
  1: {
    tier: 1,
    tones: [
      { type: "sine", startFrequency: 880, endFrequency: 1_320, duration: 0.11, volume: 0.2, delay: 0 },
      { type: "sine", startFrequency: 1_080, endFrequency: 1_420, duration: 0.08, volume: 0.07, delay: 0.095 },
    ],
  },
  2: {
    tier: 2,
    tones: [
      { type: "triangle", startFrequency: 620, endFrequency: 820, duration: 0.12, volume: 0.2, delay: 0 },
      { type: "triangle", startFrequency: 820, endFrequency: 1_080, duration: 0.14, volume: 0.23, delay: 0.105 },
    ],
  },
  3: {
    tier: 3,
    tones: [
      { type: "triangle", startFrequency: 120, endFrequency: 58, duration: 0.3, volume: 0.25, delay: 0 },
      { type: "square", startFrequency: 330, endFrequency: 470, duration: 0.16, volume: 0.12, delay: 0.025 },
      { type: "sine", startFrequency: 470, endFrequency: 690, duration: 0.18, volume: 0.16, delay: 0.14 },
    ],
  },
  4: {
    tier: 4,
    tones: [
      { type: "sine", startFrequency: 95, endFrequency: 42, duration: 0.36, volume: 0.3, delay: 0 },
      { type: "triangle", startFrequency: 155, endFrequency: 62, duration: 0.22, volume: 0.17, delay: 0.04 },
      { type: "sawtooth", startFrequency: 760, endFrequency: 1_450, duration: 0.21, volume: 0.13, delay: 0.09 },
    ],
  },
  5: {
    tier: 5,
    tones: [
      { type: "sine", startFrequency: 58, endFrequency: 30, duration: 0.72, volume: 0.34, delay: 0 },
      { type: "triangle", startFrequency: 280, endFrequency: 390, duration: 0.16, volume: 0.16, delay: 0.04 },
      { type: "triangle", startFrequency: 420, endFrequency: 560, duration: 0.16, volume: 0.17, delay: 0.17 },
      { type: "triangle", startFrequency: 630, endFrequency: 820, duration: 0.18, volume: 0.19, delay: 0.3 },
      { type: "sawtooth", startFrequency: 945, endFrequency: 1_520, duration: 0.22, volume: 0.16, delay: 0.44 },
      { type: "sine", startFrequency: 1_260, endFrequency: 1_760, duration: 0.22, volume: 0.2, delay: 0.56 },
    ],
  },
};

export function killStreakCue(streak: number): KillStreakCue {
  const tier = Math.min(5, Math.max(1, Number.isFinite(streak) ? Math.trunc(streak) : 1)) as KillStreakTier;
  return KILL_STREAK_CUES[tier];
}

export function killStreakAssetUrl(streak: number): string {
  return `/assets/v3/audio/killstreak/kill-${killStreakCue(streak).tier}.wav`;
}

export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CombatAudioOptions {
  audioContextFactory?: () => AudioContext;
  killBufferLoader?: (context: AudioContext, url: string) => Promise<AudioBuffer>;
}

const SOUND_MUTED_KEY = "energy-brawl.sound-muted";
const REMOTE_FIRE_INTERVAL_MS = 140;
const MAX_ACTIVE_VOICES = 8;
const KILL_STREAK_GAIN = 1.6;

async function loadAudioBuffer(context: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Unable to load combat audio: ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export class CombatAudioPolicy {
  private unlocked = false;
  private muted = false;
  private readonly remoteFireAt = new Map<string, number>();

  unlock(): void {
    this.unlocked = true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  request(request: CombatSoundRequest, now: number): ApprovedCombatSound | null {
    if (!this.unlocked || this.muted) return null;
    if (request.kind === "fire" && !request.local) {
      const source = request.sourceId ?? "remote";
      const previous = this.remoteFireAt.get(source) ?? -Infinity;
      if (now - previous < REMOTE_FIRE_INTERVAL_MS) return null;
      this.remoteFireAt.set(source, now);
      const distance = Math.max(0, request.distance ?? 0);
      return {
        kind: "fire",
        gain: Math.max(0.12, 0.48 * (1 - Math.min(distance, 1_200) / 1_200)),
      };
    }
    return {
      kind: request.kind,
      gain: request.kind === "hurt" ? 1 : request.kind === "kill" || request.kind === "objective" ? 0.92 : request.local ? 0.78 : 0.45,
      streak: request.streak,
      objectiveStage: request.objectiveStage,
    };
  }
}

export function readSoundMuted(storage: SoundStorage): boolean {
  try {
    return storage.getItem(SOUND_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSoundMuted(storage: SoundStorage, muted: boolean): void {
  try {
    storage.setItem(SOUND_MUTED_KEY, muted ? "1" : "0");
  } catch {
    // Storage can be unavailable in privacy mode; sound still works for this session.
  }
}

export class CombatAudio {
  private readonly policy = new CombatAudioPolicy();
  private context: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeVoices = 0;
  private muted: boolean;
  private readonly audioContextFactory: () => AudioContext;
  private readonly killBufferLoader: (context: AudioContext, url: string) => Promise<AudioBuffer>;
  private readonly killBuffers = new Map<KillStreakTier, AudioBuffer>();
  private killBufferPreloadStarted = false;
  private audioPrimed = false;

  constructor(private readonly storage: SoundStorage, options: CombatAudioOptions = {}) {
    this.muted = readSoundMuted(storage);
    this.policy.setMuted(this.muted);
    this.audioContextFactory = options.audioContextFactory ?? (() => {
      const AudioContextClass = globalThis.AudioContext
        ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("AudioContext unavailable");
      return new AudioContextClass();
    });
    this.killBufferLoader = options.killBufferLoader ?? loadAudioBuffer;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    this.policy.setMuted(this.muted);
    writeSoundMuted(this.storage, this.muted);
    return this.muted;
  }

  async unlock(): Promise<void> {
    try {
      this.context ??= this.audioContextFactory();
      if (this.context.state !== "running") await this.context.resume();
      if (this.context.state !== "running") return;
      if (!this.audioPrimed) this.primeAudioOutput(this.context);
      this.noiseBuffer ??= this.createNoiseBuffer(this.context);
      this.policy.unlock();
      this.preloadKillStreakBuffers(this.context);
    } catch {
      // Browsers may reject audio until a later user gesture.
    }
  }

  private preloadKillStreakBuffers(context: AudioContext): void {
    if (this.killBufferPreloadStarted) return;
    this.killBufferPreloadStarted = true;
    for (let tier = 1; tier <= 5; tier += 1) {
      const killTier = tier as KillStreakTier;
      void this.killBufferLoader(context, killStreakAssetUrl(killTier))
        .then((buffer) => {
          if (this.context === context) this.killBuffers.set(killTier, buffer);
        })
        .catch(() => {
          // Procedural cues remain available when a device cannot fetch or decode a WAV asset.
        });
    }
  }

  private primeAudioOutput(context: AudioContext): void {
    const buffer = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start(0);
    this.audioPrimed = true;
  }

  playFire(options: { local: boolean; sourceId?: string; distance?: number }): void {
    this.play({ kind: "fire", ...options });
  }

  playImpact(): void {
    this.play({ kind: "impact", local: true });
  }

  playHurt(): void {
    this.play({ kind: "hurt", local: true });
  }

  playPickup(): void {
    this.play({ kind: "pickup", local: true });
  }

  playKillStreak(streak: number): void {
    this.play({ kind: "kill", local: true, streak });
  }

  playObjective(stage: ObjectiveSoundStage): void {
    this.play({ kind: "objective", local: true, objectiveStage: stage });
  }

  private play(request: CombatSoundRequest): void {
    const approved = this.policy.request(request, performance.now());
    const context = this.context;
    if (!approved || !context || context.state !== "running") return;
    if (this.activeVoices >= MAX_ACTIVE_VOICES && approved.kind !== "hurt" && approved.kind !== "kill") return;
    this.activeVoices += 1;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
    try {
      switch (approved.kind) {
        case "fire":
          this.playTone(context, "sine", 760, 210, 0.07, approved.gain * 0.16, 0, finish);
          break;
        case "impact":
          this.playNoiseImpact(context, 180, 70, 0.11, approved.gain * 0.18, finish);
          break;
        case "hurt":
          this.playNoiseImpact(context, 150, 82, 0.13, approved.gain * 0.22, finish, "square");
          break;
        case "pickup":
          this.playTone(context, "sine", 520, 620, 0.075, approved.gain * 0.12, 0);
          this.playTone(context, "sine", 780, 900, 0.075, approved.gain * 0.13, 0.075, finish);
          break;
        case "kill": {
          const cue = killStreakCue(approved.streak ?? 1);
          const buffer = this.killBuffers.get(cue.tier);
          if (buffer) {
            this.playBuffer(context, buffer, KILL_STREAK_GAIN * approved.gain, finish);
            break;
          }
          const finalTone = cue.tones.reduce((latest, tone) =>
            tone.delay + tone.duration > latest.delay + latest.duration ? tone : latest,
          );
          for (const tone of cue.tones) {
            this.playTone(
              context,
              tone.type,
              tone.startFrequency,
              tone.endFrequency,
              tone.duration,
              tone.volume * approved.gain,
              tone.delay,
              tone === finalTone ? finish : undefined,
            );
          }
          break;
        }
        case "objective": {
          const tones: Record<ObjectiveSoundStage, [number, number]> = {
            "capture-start": [520, 780],
            contested: [280, 210],
            captured: [640, 980],
            overtime: [180, 260],
            finish: [420, 1_080],
          };
          const stage: ObjectiveSoundStage = approved.objectiveStage ?? "capture-start";
          const [startFrequency, endFrequency] = tones[stage];
          this.playTone(context, "triangle", startFrequency, endFrequency, 0.18, approved.gain * 0.42, 0, finish);
          break;
        }
      }
    } catch {
      finish();
    }
  }

  private playBuffer(context: AudioContext, buffer: AudioBuffer, volume: number, onEnded: () => void): void {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, context.currentTime);
    compressor.threshold.setValueAtTime(-8, context.currentTime);
    compressor.knee.setValueAtTime(6, context.currentTime);
    compressor.ratio.setValueAtTime(4, context.currentTime);
    compressor.attack.setValueAtTime(0.002, context.currentTime);
    compressor.release.setValueAtTime(0.22, context.currentTime);
    source.connect(gain);
    gain.connect(compressor);
    compressor.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      compressor.disconnect();
      onEnded();
    };
    source.start(context.currentTime);
  }

  private playTone(
    context: AudioContext,
    type: OscillatorType,
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    delay: number,
    onEnded?: () => void,
  ): void {
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      onEnded?.();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.005);
  }

  private playNoiseImpact(
    context: AudioContext,
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    onEnded: () => void,
    type: OscillatorType = "triangle",
  ): void {
    this.playTone(context, type, startFrequency, endFrequency, duration, volume, 0, onEnded);
    if (!this.noiseBuffer) return;
    const start = context.currentTime;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = this.noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(type === "square" ? 1_100 : 1_700, start);
    gain.gain.setValueAtTime(Math.max(0.0001, volume * 0.52), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    noise.connect(filter).connect(gain).connect(context.destination);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    noise.start(start);
    noise.stop(start + duration);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.max(1, Math.floor(context.sampleRate * 0.14));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
