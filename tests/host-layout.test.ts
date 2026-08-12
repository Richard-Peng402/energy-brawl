import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("host dashboard layout", () => {
  it("keeps all five status-band items on one desktop row", () => {
    const statusBand = extractBlock(styles, ".host-status-band");

    expect(statusBand).toContain(
      "grid-template-columns: minmax(130px, 0.7fr) minmax(170px, 0.9fr) minmax(170px, 0.9fr) minmax(120px, 0.65fr) minmax(330px, 1.5fr)",
    );
  });

  it("does not compress command labels into vertical text", () => {
    const commandButtons = extractBlock(styles, ".host-actions > button");

    expect(commandButtons).toContain("flex: 0 0 auto");
    expect(commandButtons).toContain("white-space: nowrap");
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
