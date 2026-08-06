import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = join(root, "public", "assets", "v3");
const characterIds = ["blaze", "medic", "fortress", "arc", "phase", "runner"];
const rasterStates = ["portrait", "idle", "move", "attack", "hit", "death"];
const approvedSources = new Set([
  "local://user-provided-character-art",
  "https://opengameart.org/content/top-down-sci-fi-shooter-characters-20",
  "https://opengameart.org/content/top-down-sci-fi-shooter-pack",
  "https://opengameart.org/content/top-down-sci-fi-shooter-some-random-guys-terrain-texture",
  "https://kenney.nl/assets/top-down-shooter",
]);

const runtime = (relative) => `/assets/v3/${relative.replaceAll("\\", "/")}`;
const characterOutputs = characterIds.flatMap((id) => [
  ...rasterStates.filter((state) => state !== "portrait").map((state) => runtime(`characters/${id}/${state}.png`)),
  runtime(`characters/${id}/combat.svg`),
]);
const userCharacterOutputs = characterIds.flatMap((id) => [
  runtime(`characters/${id}/portrait.png`),
  runtime(`characters/${id}/combat.png`),
]);
const arenaOutputs = ["floor", "wall", "decal", "light"].map((name) => runtime(`arena/${name}.png`));

const manifestEntries = [
  {
    source: "User-provided character art",
    author: "Project owner",
    license: "User-provided for this project",
    sourceUrl: "local://user-provided-character-art",
    outputFiles: userCharacterOutputs,
  },
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
const combatSvg = (id, color) => {
  const bodies = {
    blaze: '<path d="M62 32h68l18 23-7 70-22 23H70l-22-23-7-70Z"/><path d="M42 58 16 82v30h28M148 58l28 24v30h-28"/><path d="M79 26h34l8 22H71Z"/>',
    medic: '<circle cx="96" cy="96" r="59"/><path d="M55 66 31 49l-9 25 27 19M137 66l24-17 9 25-27 19"/><path d="M82 80h28v18h18v28h-18v18H82v-18H64V98h18Z" fill="#f7fbff" stroke="none"/>',
    fortress: '<path d="m96 25 66 34-12 76-54 34-54-34-12-76Z"/><path d="M96 25v144M30 59h132M42 119h108" fill="none"/><path d="m29 75-22 20 17 37 31-11M163 75l22 20-17 37-31-11"/>',
    arc: '<path d="M57 42h78l24 25-12 73-27 19H72l-27-19-12-73Z"/><path d="M46 65 15 48l-7 24 34 29M146 65l31-17 7 24-34 29"/><path d="M78 29h36l11 24H67Z"/>',
    phase: '<path d="m96 18 46 36-10 82-36 39-36-39-10-82Z"/><path d="M96 18v157M50 74h92" fill="none"/><path d="M132 47 178 30v18l-43 19Z"/>',
    runner: '<path d="m96 18 56 47-21 80-35 26-35-26-21-80Z"/><path d="M48 61 9 44l6 27 38 23M144 61l39-17-6 27-38 23"/><path d="m83 24 13-12 13 12-13 21Z"/>',
  };
  const body = bodies[id] ?? bodies.blaze;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><defs><linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4fbff" stop-opacity=".42"/><stop offset=".42" stop-color="${color}"/><stop offset="1" stop-color="#08111a"/></linearGradient></defs><ellipse cx="102" cy="168" rx="66" ry="13" fill="#000" opacity=".42"/><g fill="url(#body)" stroke="#d8f5ff" stroke-width="4" stroke-linejoin="round">${body}</g><circle cx="96" cy="70" r="17" fill="#06111a" stroke="#eafcff" stroke-width="4"/><circle cx="90" cy="69" r="4" fill="${color}"/><circle cx="102" cy="69" r="4" fill="${color}"/><path d="M82 99h28" stroke="#eafcff" stroke-width="5" stroke-linecap="round"/><path d="M153 94h31" stroke="${color}" stroke-width="8" stroke-linecap="round"/><circle cx="184" cy="94" r="6" fill="#f7fbff" stroke="${color}" stroke-width="3"/></svg>`;
};
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
  await writeFile(join(assetRoot, "characters", id, "combat.svg"), combatSvg(id, colors[id]), "utf8");
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
    if (output.endsWith(".png")) {
      const { width, height } = await pngDimensions(file);
      if (width > 2048 || height > 2048) throw new Error(`Texture exceeds 2048x2048: ${output} (${width}x${height})`);
    } else if (!(await stat(file)).size) {
      throw new Error(`Generated asset is empty: ${output}`);
    }
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
