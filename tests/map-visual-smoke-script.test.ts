import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../scripts/map-visual-smoke.mjs", import.meta.url), "utf8");

describe("map visual smoke player flow", () => {
  it("joins and readies through the rendered browser flow without assuming Blaze is free", () => {
    expect(source).toContain('button.classList.contains("is-ready")');
    expect(source).toContain("const ensureReady = async () =>");
    expect(source).toContain("document.querySelector('[data-character-id]:not(:disabled)')");
    expect(source).not.toContain('[data-character-id="blaze"]');
    expect(source).not.toContain("const readyDisabled");
    expect(source).toContain("Ready was not confirmed:");
    expect(source).toContain("document.querySelector('#join-form')");
    expect(source).not.toContain("button.textContent?.includes");
    expect(source).not.toContain("const playerSocket = await connectSocket()");
  });
});
