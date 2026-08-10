import { describe, expect, it } from "vitest";

import { collectRuntimeAssetUrls, extractServerPort } from "../scripts/clean-clone-smoke";

describe("clean clone smoke asset collection", () => {
  it("deduplicates repository runtime assets and rejects external paths", () => {
    expect(collectRuntimeAssetUrls([
      { entries: [{ outputFiles: ["/assets/v3/a.png", "/assets/v3/a.png"] }] },
      { entries: [{ outputFiles: ["/assets/v4/b.png"] }] },
    ])).toEqual(["/assets/v3/a.png", "/assets/v4/b.png"]);

    expect(() => collectRuntimeAssetUrls([{ entries: [{ outputFiles: ["D:/MyPicture/a.png"] }] }]))
      .toThrow("outside repository runtime assets");
  });

  it("uses the actual fallback port printed by the spawned server", () => {
    expect(extractServerPort("主机控制台: http://127.0.0.1:3004/host?token=secret")).toBe(3004);
    expect(extractServerPort("server starting")).toBeNull();
  });
});
