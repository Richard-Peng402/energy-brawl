import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "public/assets/v4/manifest.json"), "utf8"));
const outputs = new Set();

for (const entry of manifest.entries) {
  for (const field of ["source", "author", "license", "sourceUrl", "modifications"]) {
    if (typeof entry[field] !== "string" || entry[field].trim() === "") throw new Error(`Incomplete v4 asset field: ${field}`);
  }
  if (!/^(https:\/\/|local:\/\/)/.test(entry.sourceUrl)) throw new Error(`Invalid source URL: ${entry.sourceUrl}`);
  for (const output of entry.outputFiles) {
    if (outputs.has(output)) throw new Error(`Duplicate v4 asset output: ${output}`);
    outputs.add(output);
    const info = await stat(resolve(root, `public${output}`));
    if (!info.isFile() || info.size === 0 || info.size > 512_000) throw new Error(`Invalid v4 asset: ${output}`);
  }
}

for (const license of ["KENNEY-DIGITAL-AUDIO-LICENSE.txt", "KENNEY-PARTICLE-LICENSE.txt"]) {
  const info = await stat(resolve(root, "public/assets/v4", license));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing v4 license copy: ${license}`);
}

console.log(`Validated ${outputs.size} v4 presentation assets across ${manifest.entries.length} source groups.`);
