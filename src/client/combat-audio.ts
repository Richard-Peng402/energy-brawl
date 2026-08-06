export type CombatSoundKind = "fire" | "impact" | "hurt" | "pickup";

export interface CombatSoundRequest {
  kind: CombatSoundKind;
  local: boolean;
  sourceId?: string;
  distance?: number;
}

export interface ApprovedCombatSound {
  kind: CombatSoundKind;
  gain: number;
}

export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SOUND_MUTED_KEY = "energy-brawl.sound-muted";
const REMOTE_FIRE_INTERVAL_MS = 140;
const MAX_ACTIVE_VOICES = 8;

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
      gain: request.kind === "hurt" ? 1 : request.local ? 0.78 : 0.45,
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

  constructor(private readonly storage: SoundStorage) {
    this.muted = readSoundMuted(storage);
    this.policy.setMuted(this.muted);
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
      const AudioContextClass = globalThis.AudioContext
        ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context ??= new AudioContextClass();
      if (this.context.state !== "running") await this.context.resume();
      this.noiseBuffer ??= this.createNoiseBuffer(this.context);
      this.policy.unlock();
    } catch {
      // Browsers may reject audio until a later user gesture.
    }
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

  private play(request: CombatSoundRequest): void {
    const approved = this.policy.request(request, performance.now());
    const context = this.context;
    if (!approved || !context || context.state !== "running") return;
    if (this.activeVoices >= MAX_ACTIVE_VOICES && approved.kind !== "hurt") return;
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
      }
    } catch {
      finish();
    }
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
