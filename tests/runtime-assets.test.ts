import { readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ASSET_MANIFEST } from "../src/client/asset-registry";

const publicAssetsRoot = path.resolve("public/assets");
const consolidatedRoot = path.join(publicAssetsRoot, "v3");
const runtimeExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".wav", ".mp3", ".ogg"]);

async function runtimeFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && runtimeExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

describe("portable runtime assets", () => {
  it("keeps every shipped runtime asset under public/assets/v3", async () => {
    const outsideConsolidatedRoot = (await runtimeFiles(publicAssetsRoot))
      .filter((file) => !file.startsWith(`${consolidatedRoot}${path.sep}`));

    expect(outsideConsolidatedRoot).toEqual([]);
  });

  it("records every shipped runtime asset in the portable manifest", async () => {
    const shipped = (await runtimeFiles(consolidatedRoot)).map((file) =>
      `/assets/v3/${path.relative(consolidatedRoot, file).replaceAll("\\", "/")}`,
    );
    const recorded = ASSET_MANIFEST.flatMap((entry) => entry.outputFiles).sort();

    expect(recorded).toEqual(shipped);
  });
});
