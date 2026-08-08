import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ASSET_MANIFEST } from "../src/client/asset-registry";

const publicAssetsRoot = path.resolve("public/assets");
const consolidatedRoots = [path.join(publicAssetsRoot, "v3"), path.join(publicAssetsRoot, "v4")];
const runtimeExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".wav", ".mp3", ".ogg"]);

async function runtimeFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && runtimeExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

describe("portable runtime assets", () => {
  it("keeps every shipped runtime asset under managed version folders", async () => {
    const outsideConsolidatedRoot = (await runtimeFiles(publicAssetsRoot))
      .filter((file) => !consolidatedRoots.some((root) => file.startsWith(`${root}${path.sep}`)));

    expect(outsideConsolidatedRoot).toEqual([]);
  });

  it("records every shipped runtime asset in the portable manifest", async () => {
    const shipped = (await Promise.all(consolidatedRoots.map(async (root) => {
      const version = path.basename(root);
      return (await runtimeFiles(root)).map((file) => `/assets/${version}/${path.relative(root, file).replaceAll("\\", "/")}`);
    }))).flat().sort();
    const v4Manifest = JSON.parse(await readFile(path.join(publicAssetsRoot, "v4", "manifest.json"), "utf8")) as { entries: Array<{ outputFiles: string[] }> };
    const recorded = [...ASSET_MANIFEST.flatMap((entry) => entry.outputFiles), ...v4Manifest.entries.flatMap((entry) => entry.outputFiles)].sort();

    expect(recorded).toEqual(shipped);
  });
});
