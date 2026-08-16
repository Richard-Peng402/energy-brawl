import { describe, expect, it } from "vitest";

import config from "../vite.config";

describe("production chunking", () => {
  it("isolates Phaser without lowering the bundle warning budget", () => {
    expect(config.build?.chunkSizeWarningLimit).toBe(1_350);
    const output = config.build?.rollupOptions?.output;
    const manualChunks = !Array.isArray(output) ? output?.manualChunks : undefined;
    expect(typeof manualChunks).toBe("function");
    if (typeof manualChunks !== "function") return;
    expect(manualChunks("D:/repo/node_modules/phaser/dist/phaser.js", { getModuleInfo: () => null, getModuleIds: () => [] } as never)).toBe("phaser");
    expect(manualChunks("D:/repo/src/client/game-scene.ts", { getModuleInfo: () => null, getModuleIds: () => [] } as never)).toBeUndefined();
  });
});
