import type { MapId } from "../shared/map-catalog";

export interface AudioMixSettings {
  effects: number;
  ambience: number;
}

export interface AudioMixStorageReader {
  getItem(key: string): string | null;
}

export interface AudioMixStorageWriter {
  setItem(key: string, value: string): void;
}

export interface EnvironmentAudioState {
  activeMapId: MapId | null;
  previousMapId: MapId | null;
  warning: boolean;
  targetGain: number;
  settings: AudioMixSettings;
}

const EFFECTS_LEVEL_KEY = "energy-brawl.effects-level";
const AMBIENCE_LEVEL_KEY = "energy-brawl.ambience-level";
export const AMBIENCE_BASE_GAIN = 0.32;
export const AMBIENCE_WARNING_DUCK = 0.34;
export const REMOTE_FIRE_WARNING_DUCK = 0.48;
export const AMBIENCE_CROSSFADE_MS = 480;

function clampLevel(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}

export function normalizeAudioMixSettings(
  input: { effects?: unknown; ambience?: unknown } = {},
): AudioMixSettings {
  return {
    effects: clampLevel(input.effects, 1),
    ambience: clampLevel(input.ambience, 0.65),
  };
}

export function readAudioMixSettings(storage: AudioMixStorageReader): AudioMixSettings {
  try {
    return normalizeAudioMixSettings({
      effects: storage.getItem(EFFECTS_LEVEL_KEY) ?? undefined,
      ambience: storage.getItem(AMBIENCE_LEVEL_KEY) ?? undefined,
    });
  } catch {
    return normalizeAudioMixSettings();
  }
}

export function writeAudioMixSettings(storage: AudioMixStorageWriter, input: AudioMixSettings): void {
  const settings = normalizeAudioMixSettings(input);
  try {
    storage.setItem(EFFECTS_LEVEL_KEY, String(settings.effects));
    storage.setItem(AMBIENCE_LEVEL_KEY, String(settings.ambience));
  } catch {
    // Private browsing can reject persistence; in-memory settings still apply.
  }
}

export function createEnvironmentAudioState(settings: AudioMixSettings): EnvironmentAudioState {
  return {
    activeMapId: null,
    previousMapId: null,
    warning: false,
    targetGain: 0,
    settings: normalizeAudioMixSettings(settings),
  };
}

export function updateEnvironmentAudio(
  state: EnvironmentAudioState,
  input: { mapId: MapId; warning: boolean; settings?: AudioMixSettings },
): EnvironmentAudioState {
  const settings = normalizeAudioMixSettings(input.settings ?? state.settings);
  const changedMap = state.activeMapId !== input.mapId;
  return {
    activeMapId: input.mapId,
    previousMapId: changedMap ? state.activeMapId : state.previousMapId,
    warning: input.warning,
    targetGain: AMBIENCE_BASE_GAIN * settings.ambience * (input.warning ? AMBIENCE_WARNING_DUCK : 1),
    settings,
  };
}

export function combatDuckingMultiplier(
  request: { kind: string; local: boolean },
  warning: boolean,
): number {
  return warning && request.kind === "fire" && !request.local ? REMOTE_FIRE_WARNING_DUCK : 1;
}
