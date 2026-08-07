# Third-party assets

All shipped third-party art is imported only from the approved sources below. Runtime files live under `/assets/v3/`; `npm run assets:v3` rejects unknown source URLs, incomplete provenance, missing outputs, textures larger than 2048 × 2048, and an initial lobby portrait payload of 8 MiB or more.

## Tatermand — Top-down Sci-fi Shooter Characters 2.0

- Author: Tatermand
- Source: <https://opengameart.org/content/top-down-sci-fi-shooter-characters-20>
- License: [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- Local files: `public/assets/v3/characters/*/{portrait,idle,move,attack,hit,death}.png`
- Modifications: selected six figures from the supplied flattened PSD; cropped them into separate character images; removed the dark preview background; resized and applied state-specific rotation, color, opacity, and hit/death treatment. Portraits are separate files from combat-state images.
- In-game attribution: “Character artwork by Tatermand, CC-BY-SA 3.0, modified for Energy Brawl.”

The modified character raster files remain available under CC-BY-SA 3.0. No game source-code license is implied by the artwork license.

## Kenney — Top-down Shooter

- Author: Kenney
- Source: <https://kenney.nl/assets/top-down-shooter>
- License: CC0 1.0 (the downloaded package includes `License.txt`)
- Local files: `public/assets/v3/arena/{floor,wall,decal,light}.png`
- Modifications: selected and renamed four 64 × 64 tiles for the arena’s non-collision visual layers. Color and layout composition occur at runtime.
- Attribution: not required by CC0; credited here as a courtesy.

## Project-owned assets

`public/assets/v3/characters/*/fallback.svg` and `public/assets/v3/skills/*.svg` are original Energy Brawl vector fallbacks/icons generated deterministically by `scripts/import-v3-assets.mjs`; they are not third-party imports and therefore are not assigned invented upstream provenance.

## Approved but not imported in this revision

- <https://opengameart.org/content/top-down-sci-fi-shooter-pack>
- <https://opengameart.org/content/top-down-sci-fi-shooter-some-random-guys-terrain-texture>

An asset from any other URL, or one whose author/license cannot be confirmed, must not be added to the manifest.
