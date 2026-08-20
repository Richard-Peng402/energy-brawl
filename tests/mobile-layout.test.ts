import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");
const mobileApp = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");

describe("mobile lobby compact landscape layout", () => {
  it("keeps the skill control at the right safe edge and the kill feed to one row", () => {
    const skillButton = extractBlock(styles, ".skill-button");
    expect(skillButton).toContain("right:");
    expect(skillButton).toContain("env(safe-area-inset-right)");
    expect(skillButton).not.toContain("left: 50%");
    expect(skillButton).not.toContain("translateX(-50%)");
    expect(extractBlock(styles, ".skill-button.is-ready:active")).not.toContain("translateX(-50%)");
    expect(extractBlock(styles, ".kill-feed")).toContain("grid-template-rows: 1fr");
    expect(skillButton).toContain("bottom: max(154px");
  });

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

  it("narrows the intro pane on short iPhone landscape screens", () => {
    const generalLandscapeHeader = "@media (max-width: 1000px) and (orientation: landscape)";
    const shortLandscapeHeader = "@media (max-width: 1000px) and (max-height: 470px) and (orientation: landscape)";
    const shortLandscape = extractBlock(styles, shortLandscapeHeader);
    expect(shortLandscape).toContain("grid-template-columns: clamp(210px, 25vw, 240px) minmax(0, 1fr)");
    expect(styles.indexOf(shortLandscapeHeader)).toBeGreaterThan(styles.indexOf(generalLandscapeHeader));
  });

  it("keeps pre-match mechanism copy compact and the opening banner away from controls", () => {
    expect(mobileApp).toContain("data-map-mechanic-card");
    expect(mobileApp).toContain('id="map-mechanic-opening"');
    const card = extractBlock(styles, ".map-mechanic-card");
    const body = extractBlock(styles, ".map-mechanic-card-body");
    const banner = extractBlock(styles, ".map-mechanic-opening");
    expect(card).toContain("overflow: hidden");
    expect(body).toContain("-webkit-line-clamp: 3");
    expect(banner).toContain("pointer-events: none");
    expect(banner).toContain("top:");
    expect(banner).not.toContain("bottom:");
  });

  it("moves lobby map notices into the post-join side panel", () => {
    expect(mobileApp).toContain('class="lobby-info-panel"');
    expect(mobileApp).toContain('data-map-mechanic-card');
    expect(mobileApp).toContain('data-map-event-card');
    const introStart = mobileApp.indexOf('<div class="lobby-intro">');
    const workspaceStart = mobileApp.indexOf('<div class="lobby-workspace">');
    const infoStart = mobileApp.indexOf('<aside class="lobby-info-panel"');
    const mechanicStart = mobileApp.indexOf('data-map-mechanic-card', infoStart);
    const eventStart = mobileApp.indexOf('data-map-event-card', infoStart);
    expect(introStart).toBeGreaterThanOrEqual(0);
    expect(workspaceStart).toBeGreaterThan(introStart);
    expect(infoStart).toBeGreaterThan(workspaceStart);
    expect(mechanicStart).toBeGreaterThan(infoStart);
    expect(eventStart).toBeGreaterThan(infoStart);
  });

  it("shows all tactical modules without a horizontal scroller", () => {
    const tactical = extractBlock(styles, ".tactical-module-list");
    expect(tactical).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(tactical).toContain("overflow-x: hidden");
    expect(extractBlock(styles, ".tactical-module-section")).toContain("grid-column: 1 / -1");
    const compact = extractBlock(styles, "@media (max-width: 900px) and (orientation: landscape)");
    expect(compact).toContain(".tactical-module-list");
    expect(compact).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
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
