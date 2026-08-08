import type { CharacterId } from "../shared/character-catalog";

/**
 * Visual timing and palette for the lobby's six-second character reveal.
 *
 * The timeline is shared by every character so the right-hand dossier never
 * jumps between different layouts. Only the palette and portrait change.
 */
export interface CharacterPreviewMotion {
  readonly characterId: CharacterId;
  readonly durationMs: 6_000;
  readonly primaryColor: `#${string}`;
  readonly accentColor: `#${string}`;
  readonly cssClass: `is-${CharacterId}`;
}

const MOTION_BY_CHARACTER: Readonly<Record<CharacterId, CharacterPreviewMotion>> = {
  blaze: {
    characterId: "blaze",
    durationMs: 6_000,
    primaryColor: "#ff5a5f",
    accentColor: "#ffb86b",
    cssClass: "is-blaze",
  },
  medic: {
    characterId: "medic",
    durationMs: 6_000,
    primaryColor: "#31d0aa",
    accentColor: "#9dffe3",
    cssClass: "is-medic",
  },
  fortress: {
    characterId: "fortress",
    durationMs: 6_000,
    primaryColor: "#4da3ff",
    accentColor: "#b6e3ff",
    cssClass: "is-fortress",
  },
  arc: {
    characterId: "arc",
    durationMs: 6_000,
    primaryColor: "#ffd166",
    accentColor: "#fff0a6",
    cssClass: "is-arc",
  },
  phase: {
    characterId: "phase",
    durationMs: 6_000,
    primaryColor: "#c77dff",
    accentColor: "#e8c7ff",
    cssClass: "is-phase",
  },
  runner: {
    characterId: "runner",
    durationMs: 6_000,
    primaryColor: "#ff8c42",
    accentColor: "#ffd0a3",
    cssClass: "is-runner",
  },
};

export function getCharacterPreviewMotion(characterId: CharacterId): CharacterPreviewMotion {
  const motion = MOTION_BY_CHARACTER[characterId];
  if (!motion) throw new Error(`Unknown character preview: ${characterId}`);
  return motion;
}

export const CHARACTER_PREVIEW_CLASSES = Object.values(MOTION_BY_CHARACTER).map((motion) => motion.cssClass);
