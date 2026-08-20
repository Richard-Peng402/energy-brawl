import type { MapMechanicKind } from "../shared/map-mechanics";
import type { MapId } from "../shared/map-catalog";
import { MAP_AMBIENCE_ASSETS } from "./asset-registry";
import {
  AMBIENCE_CROSSFADE_MS,
  combatDuckingMultiplier,
  createEnvironmentAudioState,
  normalizeAudioMixSettings,
  readAudioMixSettings,
  updateEnvironmentAudio,
  writeAudioMixSettings,
  type AudioMixSettings,
  type EnvironmentAudioState,
} from "./environment-audio";
import { getExclusiveSkillAudioProfile } from "./exclusive-skill-audio";
import { EXCLUSIVE_SKILL_IDS, type ExclusiveSkillId } from "../shared/exclusive-skill-catalog";
import type { ExclusiveSkillEventStage } from "../shared/protocol";
import type { EliminationRoundOutcome } from "./elimination-feedback";

export type CombatSoundKind = "fire" | "impact" | "hurt" | "pickup" | "kill" | "objective" | "map-mechanic" | "exclusive-skill" | "elimination-round";
export type ObjectiveSoundStage = "capture-start" | "contested" | "captured" | "overtime" | "finish";
export type MapMechanicSoundStage = "warning" | "active";

export interface CombatSoundRequest {
  kind: CombatSoundKind;
  local: boolean;
  sourceId?: string;
  distance?: number;
  streak?: number;
  objectiveStage?: ObjectiveSoundStage;
  mapMechanicKind?: MapMechanicKind;
  mapMechanicStage?: MapMechanicSoundStage;
  skillId?: ExclusiveSkillId;
  skillStage?: ExclusiveSkillEventStage;
  eliminationOutcome?: EliminationRoundOutcome;
  pan?: number;
}

export interface ApprovedCombatSound {
  kind: CombatSoundKind;
  gain: number;
  streak?: number;
  objectiveStage?: ObjectiveSoundStage;
  mapMechanicKind?: MapMechanicKind;
  mapMechanicStage?: MapMechanicSoundStage;
  skillId?: ExclusiveSkillId;
  skillStage?: ExclusiveSkillEventStage;
  eliminationOutcome?: EliminationRoundOutcome;
  pan: number;
  priority: number;
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

export interface MapMechanicAudioCue {
  kind: MapMechanicKind;
  stage: MapMechanicSoundStage;
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

const MAP_MECHANIC_TONES: Readonly<Record<MapMechanicKind, Readonly<Record<MapMechanicSoundStage, readonly SynthTone[]>>>> = {
  "reactor-vent": {
    warning: [
      { type: "sawtooth", startFrequency: 520, endFrequency: 280, duration: 0.12, volume: 0.2, delay: 0 },
      { type: "sawtooth", startFrequency: 420, endFrequency: 220, duration: 0.14, volume: 0.22, delay: 0.16 },
    ],
    active: [
      { type: "triangle", startFrequency: 108, endFrequency: 46, duration: 0.42, volume: 0.34, delay: 0 },
      { type: "square", startFrequency: 92, endFrequency: 48, duration: 0.24, volume: 0.16, delay: 0.05 },
    ],
  },
  "neon-overdrive": {
    warning: [
      { type: "sine", startFrequency: 460, endFrequency: 720, duration: 0.1, volume: 0.14, delay: 0 },
      { type: "sine", startFrequency: 620, endFrequency: 980, duration: 0.13, volume: 0.2, delay: 0.11 },
    ],
    active: [
      { type: "triangle", startFrequency: 420, endFrequency: 680, duration: 0.1, volume: 0.15, delay: 0 },
      { type: "triangle", startFrequency: 680, endFrequency: 1_020, duration: 0.12, volume: 0.18, delay: 0.1 },
      { type: "sine", startFrequency: 1_020, endFrequency: 1_520, duration: 0.16, volume: 0.2, delay: 0.22 },
    ],
  },
  "crystal-resonance": {
    warning: [
      { type: "sine", startFrequency: 440, endFrequency: 520, duration: 0.16, volume: 0.15, delay: 0 },
      { type: "sine", startFrequency: 660, endFrequency: 780, duration: 0.18, volume: 0.17, delay: 0.22 },
    ],
    active: [
      { type: "sine", startFrequency: 520, endFrequency: 620, duration: 0.18, volume: 0.14, delay: 0 },
      { type: "sine", startFrequency: 780, endFrequency: 900, duration: 0.2, volume: 0.16, delay: 0.12 },
      { type: "triangle", startFrequency: 1_040, endFrequency: 1_360, duration: 0.24, volume: 0.2, delay: 0.26 },
    ],
  },
};

export function mapMechanicAudioCue(kind: MapMechanicKind, stage: MapMechanicSoundStage): MapMechanicAudioCue {
  return { kind, stage, tones: MAP_MECHANIC_TONES[kind][stage] };
}

export function killStreakCue(streak: number): KillStreakCue {
  const tier = Math.min(5, Math.max(1, Number.isFinite(streak) ? Math.trunc(streak) : 1)) as KillStreakTier;
  return KILL_STREAK_CUES[tier];
}

export function killStreakAssetUrl(streak: number): string {
  return `/assets/v3/audio/killstreak/kill-${killStreakCue(streak).tier}.wav`;
}

const ELIMINATION_ROUND_CUES: Readonly<Record<EliminationRoundOutcome, readonly SynthTone[]>> = {
  win: [
    { type: "triangle", startFrequency: 420, endFrequency: 620, duration: 0.14, volume: 0.22, delay: 0 },
    { type: "triangle", startFrequency: 620, endFrequency: 920, duration: 0.16, volume: 0.25, delay: 0.12 },
    { type: "sine", startFrequency: 920, endFrequency: 1_480, duration: 0.24, volume: 0.28, delay: 0.26 },
  ],
  loss: [
    { type: "sawtooth", startFrequency: 260, endFrequency: 150, duration: 0.2, volume: 0.2, delay: 0 },
    { type: "sine", startFrequency: 150, endFrequency: 72, duration: 0.34, volume: 0.3, delay: 0.14 },
  ],
};

export function eliminationRoundAudioCue(outcome: EliminationRoundOutcome): readonly SynthTone[] {
  return ELIMINATION_ROUND_CUES[outcome];
}

export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CombatAudioOptions {
  audioContextFactory?: () => AudioContext;
  killBufferLoader?: (context: AudioContext, url: string) => Promise<AudioBuffer>;
  skillBufferLoader?: (context: AudioContext, url: string) => Promise<AudioBuffer>;
  environmentBufferLoader?: (context: AudioContext, url: string) => Promise<AudioBuffer>;
}

interface AmbienceVoice {
  mapId: MapId;
  sampled: boolean;
  gain: GainNode;
  stop: () => void;
}

const SOUND_MUTED_KEY = "energy-brawl.sound-muted";
const REMOTE_FIRE_INTERVAL_MS = 140;
const MAX_ACTIVE_VOICES = 8;
const KILL_STREAK_GAIN = 1.6;
const MAX_ACTIVE_VOICES_BY_KIND: Readonly<Record<CombatSoundKind, number>> = {
  fire: 3,
  impact: 2,
  hurt: 2,
  pickup: 1,
  kill: 2,
  objective: 2,
  "map-mechanic": 2,
  "exclusive-skill": 4,
  "elimination-round": 1,
};

async function loadAudioBuffer(context: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Unable to load combat audio: ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export function soundPriority(request: Pick<CombatSoundRequest, "kind" | "local">): number {
  if (request.kind === "kill" && request.local) return 100;
  if (request.kind === "hurt" && request.local) return 90;
  if (request.kind === "exclusive-skill") return request.local ? 76 : 58;
  if (request.kind === "objective" || request.kind === "map-mechanic" || request.kind === "elimination-round") return 70;
  if (request.kind === "fire") return request.local ? 42 : 20;
  return request.local ? 48 : 32;
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
        pan: Math.max(-0.75, Math.min(0.75, request.pan ?? 0)),
        priority: soundPriority(request),
      };
    }
    if (request.kind === "exclusive-skill") {
      const skillId = request.skillId ?? "breach";
      const skillStage = request.skillStage ?? "cast";
      const profile = getExclusiveSkillAudioProfile(skillId, skillStage);
      const distance = Math.max(0, request.distance ?? 0);
      const distanceGain = request.local ? 1 : Math.max(0, Math.min(1, 1 - distance / profile.maxDistance));
      return {
        kind: request.kind,
        gain: Math.max(0, Math.min(1, profile.gain * (request.local ? 1 : 0.68) * distanceGain)),
        skillId,
        skillStage,
        pan: Math.max(-0.75, Math.min(0.75, request.pan ?? 0)),
        priority: soundPriority(request),
      };
    }
    return {
      kind: request.kind,
      gain: request.kind === "hurt" ? 1 : request.kind === "kill" || request.kind === "objective" || request.kind === "map-mechanic" || request.kind === "elimination-round" ? 0.92 : request.local ? 0.78 : 0.45,
      streak: request.streak,
      objectiveStage: request.objectiveStage,
      mapMechanicKind: request.mapMechanicKind,
      mapMechanicStage: request.mapMechanicStage,
      eliminationOutcome: request.eliminationOutcome,
      pan: Math.max(-0.75, Math.min(0.75, request.pan ?? 0)),
      priority: soundPriority(request),
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
  private readonly activeVoicesByKind = new Map<CombatSoundKind, number>();
  private muted: boolean;
  private readonly audioContextFactory: () => AudioContext;
  private readonly killBufferLoader: (context: AudioContext, url: string) => Promise<AudioBuffer>;
  private readonly skillBufferLoader: (context: AudioContext, url: string) => Promise<AudioBuffer>;
  private readonly environmentBufferLoader: (context: AudioContext, url: string) => Promise<AudioBuffer>;
  private readonly killBuffers = new Map<KillStreakTier, AudioBuffer>();
  private readonly skillBuffers = new Map<string, AudioBuffer>();
  private readonly environmentBuffers = new Map<MapId, AudioBuffer>();
  private mixSettings: AudioMixSettings;
  private environmentState: EnvironmentAudioState;
  private ambienceVoice: AmbienceVoice | null = null;
  private environmentRequested = false;
  private killBufferPreloadStarted = false;
  private skillBufferPreloadStarted = false;
  private environmentBufferPreloadStarted = false;
  private audioPrimed = false;

  constructor(private readonly storage: SoundStorage, options: CombatAudioOptions = {}) {
    this.muted = readSoundMuted(storage);
    this.mixSettings = readAudioMixSettings(storage);
    this.environmentState = createEnvironmentAudioState(this.mixSettings);
    this.policy.setMuted(this.muted);
    this.audioContextFactory = options.audioContextFactory ?? (() => {
      const AudioContextClass = globalThis.AudioContext
        ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("AudioContext unavailable");
      return new AudioContextClass();
    });
    this.killBufferLoader = options.killBufferLoader ?? loadAudioBuffer;
    this.skillBufferLoader = options.skillBufferLoader ?? loadAudioBuffer;
    this.environmentBufferLoader = options.environmentBufferLoader ?? loadAudioBuffer;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get effectsLevel(): number {
    return this.mixSettings.effects;
  }

  get ambienceLevel(): number {
    return this.mixSettings.ambience;
  }

  setEffectsLevel(level: number): void {
    this.mixSettings = normalizeAudioMixSettings({ ...this.mixSettings, effects: level });
    this.persistMixSettings();
  }

  setAmbienceLevel(level: number): void {
    this.mixSettings = normalizeAudioMixSettings({ ...this.mixSettings, ambience: level });
    this.environmentState = this.environmentState.activeMapId
      ? updateEnvironmentAudio(this.environmentState, {
        mapId: this.environmentState.activeMapId,
        warning: this.environmentState.warning,
        settings: this.mixSettings,
      })
      : createEnvironmentAudioState(this.mixSettings);
    this.persistMixSettings();
    this.applyAmbienceTarget(120);
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    this.policy.setMuted(this.muted);
    writeSoundMuted(this.storage, this.muted);
    this.applyAmbienceTarget(120);
    return this.muted;
  }

  updateEnvironment(input: { mapId: MapId; warning: boolean }): void {
    const previousMapId = this.environmentState.activeMapId;
    const previousGain = this.environmentState.targetGain;
    this.environmentRequested = true;
    this.environmentState = updateEnvironmentAudio(this.environmentState, { ...input, settings: this.mixSettings });
    if (previousMapId !== input.mapId) this.ensureAmbienceVoice();
    else if (previousGain !== this.environmentState.targetGain) this.applyAmbienceTarget(120);
  }

  stopEnvironment(): void {
    this.environmentRequested = false;
    const voice = this.ambienceVoice;
    this.ambienceVoice = null;
    if (voice) this.fadeAndStopAmbienceVoice(voice);
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
      this.preloadExclusiveSkillBuffers(this.context);
      this.preloadEnvironmentBuffers(this.context);
      this.ensureAmbienceVoice();
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

  private preloadExclusiveSkillBuffers(context: AudioContext): void {
    if (this.skillBufferPreloadStarted) return;
    this.skillBufferPreloadStarted = true;
    for (const skillId of EXCLUSIVE_SKILL_IDS) {
      for (const stage of ["cast", "active", "end"] as const) {
        const profile = getExclusiveSkillAudioProfile(skillId, stage);
        const key = `${skillId}:${stage}`;
        void this.skillBufferLoader(context, profile.sampleUrl)
          .then((buffer) => {
            if (this.context === context) this.skillBuffers.set(key, buffer);
          })
          .catch(() => {
            // Procedural skill cues remain available when samples are absent or unsupported.
          });
      }
    }
  }

  private preloadEnvironmentBuffers(context: AudioContext): void {
    if (this.environmentBufferPreloadStarted) return;
    this.environmentBufferPreloadStarted = true;
    for (const [mapId, url] of Object.entries(MAP_AMBIENCE_ASSETS) as Array<[MapId, string]>) {
      void this.environmentBufferLoader(context, url)
        .then((buffer) => {
          if (this.context !== context) return;
          this.environmentBuffers.set(mapId, buffer);
          if (this.environmentState.activeMapId === mapId) this.ensureAmbienceVoice();
        })
        .catch(() => {
          if (this.environmentState.activeMapId === mapId) this.ensureAmbienceVoice();
        });
    }
  }

  private ensureAmbienceVoice(): void {
    const context = this.context;
    const mapId = this.environmentState.activeMapId;
    if (!this.environmentRequested || !context || context.state !== "running" || !mapId) return;
    const buffer = this.environmentBuffers.get(mapId);
    if (this.ambienceVoice?.mapId === mapId && (this.ambienceVoice.sampled || !buffer)) {
      this.applyAmbienceTarget(120);
      return;
    }

    const previous = this.ambienceVoice;
    const next = buffer
      ? this.createSampledAmbienceVoice(context, mapId, buffer)
      : this.createProceduralAmbienceVoice(context, mapId);
    this.ambienceVoice = next;
    this.applyAmbienceTarget(AMBIENCE_CROSSFADE_MS);
    if (previous) this.fadeAndStopAmbienceVoice(previous);
  }

  private createSampledAmbienceVoice(context: AudioContext, mapId: MapId, buffer: AudioBuffer): AmbienceVoice {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    source.connect(gain).connect(context.destination);
    source.start(context.currentTime);
    return {
      mapId,
      sampled: true,
      gain,
      stop: () => {
        try { source.stop(); } catch { /* The source may already be stopped. */ }
        source.disconnect();
        gain.disconnect();
      },
    };
  }

  private createProceduralAmbienceVoice(context: AudioContext, mapId: MapId): AmbienceVoice {
    const frequencies: Readonly<Record<MapId, readonly [number, number]>> = {
      "reactor-core": [46, 92],
      "neon-docks": [64, 128],
      "crystal-ruins": [72, 216],
    };
    const gain = context.createGain();
    const oscillators = frequencies[mapId].map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      oscillator.connect(gain);
      oscillator.start(context.currentTime);
      return oscillator;
    });
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.connect(context.destination);
    return {
      mapId,
      sampled: false,
      gain,
      stop: () => {
        for (const oscillator of oscillators) {
          try { oscillator.stop(); } catch { /* The oscillator may already be stopped. */ }
          oscillator.disconnect();
        }
        gain.disconnect();
      },
    };
  }

  private applyAmbienceTarget(transitionMs: number): void {
    const context = this.context;
    const voice = this.ambienceVoice;
    if (!context || !voice) return;
    const target = this.muted || !this.environmentRequested
      ? 0.0001
      : Math.max(0.0001, this.environmentState.targetGain * (voice.sampled ? 1 : 0.12));
    voice.gain.gain.cancelScheduledValues(context.currentTime);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), context.currentTime);
    voice.gain.gain.linearRampToValueAtTime(target, context.currentTime + transitionMs / 1_000);
  }

  private fadeAndStopAmbienceVoice(voice: AmbienceVoice): void {
    const context = this.context;
    if (!context) { voice.stop(); return; }
    voice.gain.gain.cancelScheduledValues(context.currentTime);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), context.currentTime);
    voice.gain.gain.linearRampToValueAtTime(0.0001, context.currentTime + AMBIENCE_CROSSFADE_MS / 1_000);
    globalThis.setTimeout(() => voice.stop(), AMBIENCE_CROSSFADE_MS + 40);
  }

  private persistMixSettings(): void {
    writeAudioMixSettings(this.storage, this.mixSettings);
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

  playEliminationRound(outcome: EliminationRoundOutcome): void {
    this.play({ kind: "elimination-round", local: true, eliminationOutcome: outcome });
  }

  playMapMechanic(kind: MapMechanicKind, stage: MapMechanicSoundStage): void {
    this.play({ kind: "map-mechanic", local: true, mapMechanicKind: kind, mapMechanicStage: stage });
  }

  playExclusiveSkill(options: {
    skillId: ExclusiveSkillId;
    stage: ExclusiveSkillEventStage;
    local: boolean;
    sourceId?: string;
    distance?: number;
    pan?: number;
  }): void {
    this.play({ kind: "exclusive-skill", skillStage: options.stage, ...options });
  }

  private play(request: CombatSoundRequest): void {
    const approved = this.policy.request(request, performance.now());
    const context = this.context;
    if (!approved || !context || context.state !== "running") return;
    if (this.activeVoices >= MAX_ACTIVE_VOICES && approved.kind !== "hurt" && approved.kind !== "kill") return;
    const categoryVoices = this.activeVoicesByKind.get(approved.kind) ?? 0;
    if (categoryVoices >= MAX_ACTIVE_VOICES_BY_KIND[approved.kind] && approved.priority < 80) return;
    const mixedGain = approved.gain
      * this.mixSettings.effects
      * combatDuckingMultiplier(request, this.environmentState.warning);
    this.activeVoices += 1;
    this.activeVoicesByKind.set(approved.kind, categoryVoices + 1);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      const remaining = Math.max(0, (this.activeVoicesByKind.get(approved.kind) ?? 1) - 1);
      if (remaining === 0) this.activeVoicesByKind.delete(approved.kind);
      else this.activeVoicesByKind.set(approved.kind, remaining);
    };
    try {
      switch (approved.kind) {
        case "fire":
          this.playTone(context, "sine", 760, 210, 0.07, mixedGain * 0.16, 0, finish);
          break;
        case "impact":
          this.playNoiseImpact(context, 180, 70, 0.11, mixedGain * 0.18, finish);
          break;
        case "hurt":
          this.playNoiseImpact(context, 150, 82, 0.13, mixedGain * 0.22, finish, "square");
          break;
        case "pickup":
          this.playTone(context, "sine", 520, 620, 0.075, mixedGain * 0.12, 0);
          this.playTone(context, "sine", 780, 900, 0.075, mixedGain * 0.13, 0.075, finish);
          break;
        case "kill": {
          const cue = killStreakCue(approved.streak ?? 1);
          const buffer = this.killBuffers.get(cue.tier);
          if (buffer) {
            this.playBuffer(context, buffer, KILL_STREAK_GAIN * mixedGain, finish);
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
              tone.volume * mixedGain,
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
          this.playTone(context, "triangle", startFrequency, endFrequency, 0.18, mixedGain * 0.42, 0, finish);
          break;
        }
        case "map-mechanic": {
          const cue = mapMechanicAudioCue(approved.mapMechanicKind ?? "reactor-vent", approved.mapMechanicStage ?? "warning");
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
              tone.volume * mixedGain,
              tone.delay,
              tone === finalTone ? finish : undefined,
            );
          }
          break;
        }
        case "exclusive-skill": {
          const skillId = approved.skillId ?? "breach";
          const stage = approved.skillStage ?? "cast";
          const profile = getExclusiveSkillAudioProfile(skillId, stage);
          const buffer = this.skillBuffers.get(`${skillId}:${stage}`);
          if (buffer) {
            this.playBuffer(context, buffer, mixedGain, finish, approved.pan);
            break;
          }
          const finalTone = profile.fallbackTones.reduce((latest, tone) =>
            tone.delay + tone.duration > latest.delay + latest.duration ? tone : latest,
          );
          for (const tone of profile.fallbackTones) {
            this.playTone(
              context,
              tone.type,
              tone.startFrequency,
              tone.endFrequency,
              tone.duration,
              tone.volume * mixedGain,
              tone.delay,
              tone === finalTone ? finish : undefined,
              approved.pan,
            );
          }
          break;
        }
        case "elimination-round": {
          const cue = eliminationRoundAudioCue(approved.eliminationOutcome ?? "loss");
          const finalTone = cue.at(-1)!;
          for (const tone of cue) {
            this.playTone(
              context,
              tone.type,
              tone.startFrequency,
              tone.endFrequency,
              tone.duration,
              tone.volume * mixedGain,
              tone.delay,
              tone === finalTone ? finish : undefined,
            );
          }
          break;
        }
      }
    } catch {
      finish();
    }
  }

  private playBuffer(context: AudioContext, buffer: AudioBuffer, volume: number, onEnded: () => void, pan = 0): void {
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
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    panner?.pan.setValueAtTime(Math.max(-0.75, Math.min(0.75, pan)), context.currentTime);
    source.connect(gain);
    gain.connect(compressor);
    if (panner) compressor.connect(panner).connect(context.destination);
    else compressor.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      compressor.disconnect();
      panner?.disconnect();
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
    pan = 0,
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
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    panner?.pan.setValueAtTime(Math.max(-0.75, Math.min(0.75, pan)), start);
    oscillator.connect(gain);
    if (panner) gain.connect(panner).connect(context.destination);
    else gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      panner?.disconnect();
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
