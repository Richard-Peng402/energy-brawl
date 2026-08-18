import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hostSource = readFileSync(new URL("../src/client/host-app.ts", import.meta.url), "utf8");

describe("team elimination host controls", () => {
  it("exposes the elimination mode and lobby-only round controls", () => {
    expect(hostSource).toContain('value="teamElimination3v3"');
    expect(hostSource).toContain("host-elimination-rules");
    expect(hostSource).toContain("setEliminationRules");
    expect(hostSource).toContain("eliminationRules");
  });
});
