import manifest from "../../public/assets/v3/manifest.json";

import type { CharacterId } from "../shared/character-catalog";

export const APPROVED_ASSET_SOURCES = [
  "local://user-provided-character-art",
  "local://user-provided-weapon-art",
  "local://user-provided-killstreak-audio",
  "local://energy-brawl-project-assets",
  "https://opengameart.org/content/top-down-sci-fi-shooter-characters-20",
  "https://opengameart.org/content/top-down-sci-fi-shooter-pack",
  "https://opengameart.org/content/top-down-sci-fi-shooter-some-random-guys-terrain-texture",
  "https://kenney.nl/assets/top-down-shooter",
  "https://kenney.nl/assets/sci-fi-rts",
  "https://kenney.nl/assets/particle-pack",
] as const;

export const USER_PROVIDED_CHARACTER_ASSET_SOURCE = "local://user-provided-character-art";
export const USER_PROVIDED_WEAPON_ASSET_SOURCE = "local://user-provided-weapon-art";

export type CharacterAssetState = "portrait" | "idle" | "move" | "attack" | "hit" | "death" | "fallback";
export const CHARACTER_DIRECTIONS = [
  "right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right",
] as const;
export type CharacterDirection = typeof CHARACTER_DIRECTIONS[number];
export type AssetManifestEntry = {
  source: string;
  author: string;
  license: string;
  sourceUrl: string;
  outputFiles: string[];
};

const path = (value: string): string => `/assets/v3/${value}`;
const character = (id: CharacterId): Record<CharacterAssetState, string> => ({
  portrait: path(`characters/${id}/portrait.png`),
  idle: path(`characters/${id}/combat.png`),
  move: path(`characters/${id}/combat.png`),
  attack: path(`characters/${id}/combat.png`),
  hit: path(`characters/${id}/combat.png`),
  death: path(`characters/${id}/combat.png`),
  fallback: path(`characters/${id}/fallback.svg`),
});

export const CHARACTER_ASSETS: Record<CharacterId, Record<CharacterAssetState, string>> = {
  blaze: character("blaze"),
  medic: character("medic"),
  fortress: character("fortress"),
  arc: character("arc"),
  phase: character("phase"),
  runner: character("runner"),
};

// Lobby portraits are deliberately pinned to a readable front-facing frame.
// Some user-provided portrait crops show the character from behind, while the
// corresponding `up` direction frame is the front-facing view in the source sheet.
export const CHARACTER_SELECTION_ASSETS: Readonly<Record<CharacterId, string>> = {
  blaze: path("characters/blaze/portrait.png"),
  medic: path("characters/medic/directions/up.png"),
  fortress: path("characters/fortress/portrait.png"),
  arc: path("characters/arc/directions/up.png"),
  phase: path("characters/phase/portrait.png"),
  runner: path("characters/runner/directions/up.png"),
};

const directionalCharacter = (id: CharacterId): Record<CharacterDirection, string> => Object.fromEntries(
  CHARACTER_DIRECTIONS.map((direction) => [direction, path(`characters/${id}/directions/${direction}.png`)]),
) as Record<CharacterDirection, string>;

export const CHARACTER_DIRECTION_ASSETS: Record<CharacterId, Record<CharacterDirection, string>> = {
  blaze: directionalCharacter("blaze"),
  medic: directionalCharacter("medic"),
  fortress: directionalCharacter("fortress"),
  arc: directionalCharacter("arc"),
  phase: directionalCharacter("phase"),
  runner: directionalCharacter("runner"),
};

export const ARENA_ASSETS = {
  floor: path("arena/floor.png"),
  wall: path("arena/wall.png"),
  decal: path("arena/decal.png"),
  light: path("arena/light.png"),
  sigil: path("arena/sigil.svg"),
} as const;

export const PICKUP_ASSETS = {
  energyCore: path("pickups/energy-core.svg"),
} as const;

export const SKILL_ICON_ASSETS = {
  dash: path("skills/dash.svg"),
  shield: path("skills/shield.svg"),
  spread: path("skills/spread.svg"),
  heal: path("skills/heal.svg"),
} as const;

export const EXCLUSIVE_SKILL_ICON_ASSETS: Readonly<Record<CharacterId, string>> = {
  blaze: "/assets/v4/fx/skills/blaze.svg",
  medic: "/assets/v4/fx/skills/medic.svg",
  fortress: "/assets/v4/fx/skills/fortress.svg",
  arc: "/assets/v4/fx/skills/arc.svg",
  phase: "/assets/v4/fx/skills/phase.svg",
  runner: "/assets/v4/fx/skills/runner.svg",
};

export const PROJECTILE_FX_ASSETS = {
  core: path("fx/projectiles/projectile-core.png"),
  trace: path("fx/projectiles/projectile-trace.png"),
  muzzle: path("fx/projectiles/muzzle-flare.png"),
  impact: path("fx/projectiles/impact-burst.png"),
  spark: path("fx/projectiles/impact-spark.png"),
  smoke: path("fx/projectiles/impact-smoke.png"),
} as const;

export const WEAPON_ASSETS = {
  "cyan-heavy": path("weapons/cyan-heavy.png"),
  "violet-rifle": path("weapons/violet-rifle.png"),
  "white-tech": path("weapons/white-tech.png"),
  "ember-cannon": path("weapons/ember-cannon.png"),
} as const;

export const ASSET_MANIFEST = manifest.entries as AssetManifestEntry[];
export const INITIAL_LOBBY_COMPRESSED_BYTES = manifest.initialLobbyCompressedBytes;

export function validateAssetManifest(entries: readonly AssetManifestEntry[]): string[] {
  const approved = new Set<string>(APPROVED_ASSET_SOURCES);
  const errors: string[] = [];

  for (const entry of entries) {
    if (!approved.has(entry.sourceUrl)) errors.push(`Unknown asset source: ${entry.sourceUrl}`);
    for (const key of ["source", "author", "license", "sourceUrl"] as const) {
      if (!entry[key]?.trim()) errors.push(`Missing ${key} for asset manifest entry`);
    }
    if (!Array.isArray(entry.outputFiles) || entry.outputFiles.length === 0) {
      errors.push(`Missing outputFiles for ${entry.source || "asset manifest entry"}`);
      continue;
    }
    for (const output of entry.outputFiles) {
      if (!output.startsWith("/assets/v3/")) errors.push(`Asset output is outside /assets/v3/: ${output}`);
    }
  }

  return errors;
}
