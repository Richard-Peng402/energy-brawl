import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = join(root, "public", "assets", "v3");
const characterIds = ["blaze", "medic", "fortress", "arc", "phase", "runner"];
const rasterStates = ["portrait", "idle", "move", "attack", "hit", "death"];
const approvedSources = new Set([
  "https://opengameart.org/content/top-down-sci-fi-shooter-characters-20",
  "https://opengameart.org/content/top-down-sci-fi-shooter-pack",
  "https://opengameart.org/content/top-down-sci-fi-shooter-some-random-guys-terrain-texture",
  "https://kenney.nl/assets/top-down-shooter",
]);

const runtime = (relative) => `/assets/v3/${relative.replaceAll("\\", "/")}`;
const characterOutputs = characterIds.flatMap((id) => rasterStates.map((state) => runtime(`characters/${id}/${state}.png`)));
const arenaOutputs = ["floor", "wall", "decal", "light"].map((name) => runtime(`arena/${name}.png`));

const manifestEntries = [
  {
    source: "Top-down Sci-fi Shooter Characters 2.0",
    author: "Tatermand",
    license: "CC-BY-SA 3.0",
    sourceUrl: "https://opengameart.org/content/top-down-sci-fi-shooter-characters-20",
    outputFiles: characterOutputs,
  },
  {
    source: "Top-down Shooter",
    author: "Kenney",
    license: "CC0 1.0",
    sourceUrl: "https://kenney.nl/assets/top-down-shooter",
    outputFiles: arenaOutputs,
  },
];

const colors = {
  blaze: "#ff5a5f", medic: "#31d0aa", fortress: "#f7b955",
  arc: "#3ea6ff", phase: "#9d7cff", runner: "#ff8a3d",
};

const fallbackSvg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><radialGradient id="g"><stop stop-color="${color}"/><stop offset="1" stop-color="#151c25"/></radialGradient></defs><circle cx="64" cy="64" r="58" fill="#091018" stroke="${color}" stroke-width="5"/><path d="M64 23 89 38l9 31-18 31H48L30 69l9-31Z" fill="url(#g)"/><circle cx="64" cy="53" r="15" fill="#dffaff"/><path d="m48 82 16-18 16 18-8 19H56Z" fill="${color}"/></svg>`;
const skillSvg = (kind) => {
  const paths = {
    dash: '<path d="m24 64 43-42-7 29h35L50 106l9-34H24Z"/>',
    shield: '<path d="M64 18 99 32v29c0 24-15 41-35 49-20-8-35-25-35-49V32Z"/><path d="M64 34v57" fill="none" stroke="#071018" stroke-width="9"/>',
    spread: '<path d="M24 30 56 64 24 98M57 30l31 34-31 34M89 30l18 34-18 34" fill="none" stroke="#eafcff" stroke-width="10" stroke-linecap="round"/>',
    heal: '<path d="M50 20h28v30h30v28H78v30H50V78H20V50h30Z"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="59" fill="#08131e" stroke="#5ee8ff" stroke-width="6"/><g fill="#eafcff">${paths[kind]}</g></svg>`;
};

await Promise.all(characterIds.map(async (id) => {
  const file = join(assetRoot, "characters", id, "fallback.svg");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, fallbackSvg(colors[id]), "utf8");
}));
await Promise.all(["dash", "shield", "spread", "heal"].map(async (kind) => {
  const file = join(assetRoot, "skills", `${kind}.svg`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, skillSvg(kind), "utf8");
}));

const pngDimensions = async (file) => {
  const header = await readFile(file);
  if (header.length < 24 || header.toString("ascii", 1, 4) !== "PNG") throw new Error(`Expected PNG: ${file}`);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

for (const entry of manifestEntries) {
  if (!approvedSources.has(entry.sourceUrl)) throw new Error(`Unknown provenance: ${entry.sourceUrl}`);
  if (!entry.source || !entry.author || !entry.license || entry.outputFiles.length === 0) throw new Error("Incomplete provenance entry");
  for (const output of entry.outputFiles) {
    if (!output.startsWith("/assets/v3/")) throw new Error(`Invalid runtime path: ${output}`);
    const file = join(root, "public", output);
    const { width, height } = await pngDimensions(file);
    if (width > 2048 || height > 2048) throw new Error(`Texture exceeds 2048x2048: ${output} (${width}x${height})`);
  }
}

for (const id of characterIds) {
  const portrait = runtime(`characters/${id}/portrait.png`);
  if (portrait === runtime(`characters/${id}/idle.png`)) throw new Error(`Portrait must be separate from combat art: ${id}`);
}

const lobbyFiles = characterIds.map((id) => join(assetRoot, "characters", id, "portrait.png"));
const initialLobbyCompressedBytes = (await Promise.all(lobbyFiles.map((file) => stat(file)))).reduce((sum, file) => sum + file.size, 0);
if (initialLobbyCompressedBytes >= 8 * 1024 * 1024) throw new Error(`Initial lobby assets exceed 8 MiB: ${initialLobbyCompressedBytes}`);

const manifest = {
  generatedBy: "npm run assets:v3",
  maxTextureDimension: 2048,
  initialLobbyCompressedBytes,
  entries: manifestEntries,
};
await mkdir(assetRoot, { recursive: true });
await writeFile(join(assetRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`v3 assets validated: ${manifestEntries.flatMap((entry) => entry.outputFiles).length} imported files, lobby ${initialLobbyCompressedBytes} bytes`);
