import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "public/assets/v4/manifest.json"), "utf8"));
for (const entry of manifest.entries) {
  if (!entry.author || !entry.license || !entry.sourceUrl) throw new Error("v4 asset attribution is incomplete");
  for (const output of entry.outputFiles) {
    const info = await stat(resolve(root, `public${output}`));
    if (!info.isFile() || info.size === 0 || info.size > 512_000) throw new Error(`invalid v4 asset: ${output}`);
  }
}
console.log(`Validated ${manifest.entries.length} v4 skill assets.`);
