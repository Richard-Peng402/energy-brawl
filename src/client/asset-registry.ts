import manifest from "../../public/assets/v3/manifest.json";

import type { CharacterId } from "../shared/character-catalog";

export const APPROVED_ASSET_SOURCES = [
  "https://opengameart.org/content/top-down-sci-fi-shooter-characters-20",
  "https://opengameart.org/content/top-down-sci-fi-shooter-pack",
  "https://opengameart.org/content/top-down-sci-fi-shooter-some-random-guys-terrain-texture",
  "https://kenney.nl/assets/top-down-shooter",
] as const;

export type CharacterAssetState = "portrait" | "idle" | "move" | "attack" | "hit" | "death" | "fallback";
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
  idle: path(`characters/${id}/idle.png`),
  move: path(`characters/${id}/move.png`),
  attack: path(`characters/${id}/attack.png`),
  hit: path(`characters/${id}/hit.png`),
  death: path(`characters/${id}/death.png`),
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

export const ARENA_ASSETS = {
  floor: path("arena/floor.png"),
  wall: path("arena/wall.png"),
  decal: path("arena/decal.png"),
  light: path("arena/light.png"),
} as const;

export const SKILL_ICON_ASSETS = {
  dash: path("skills/dash.svg"),
  shield: path("skills/shield.svg"),
  spread: path("skills/spread.svg"),
  heal: path("skills/heal.svg"),
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
