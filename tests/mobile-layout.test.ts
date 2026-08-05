import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("mobile lobby compact landscape layout", () => {
  it("lets every sub-1000px landscape grid shrink instead of enforcing a desktop minimum", () => {
    const landscape = extractBlock(
      styles,
      "@media (max-width: 1000px) and (orientation: landscape)",
    );

    expect(landscape).toContain("grid-template-columns: minmax(170px, 0.5fr) minmax(0, 1fr)");
    expect(landscape).toContain("grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr)");
    expect(landscape).toContain("min-width: 0");
    expect(landscape).toContain("overflow-x: hidden");
    expect(extractBlock(landscape, ".color-swatch")).toContain("min-width: 0");
  });

  it("provides a zero-minimum grid at 667px so the roster cannot force horizontal overflow", () => {
    const compactLandscape = extractBlock(
      styles,
      "@media (max-width: 720px) and (orientation: landscape)",
    );

    expect(compactLandscape).toContain(".lobby-screen");
    expect(compactLandscape).toContain("grid-template-columns: 170px minmax(0, 1fr)");
    expect(compactLandscape).toContain("min-width: 0");
    expect(compactLandscape).toContain("overflow-x: hidden");
    expect(compactLandscape).toContain(".lobby-workspace");
    expect(compactLandscape).toContain("grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr)");
  });
});

function extractBlock(css: string, header: string): string {
  const start = css.indexOf(header);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  if (open < 0) return "";

  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  return "";
}
