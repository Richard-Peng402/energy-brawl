import { describe, expect, it } from "vitest";

import { renderTacticalModuleCards } from "../src/client/tactical-module-ui";

describe("tactical module lobby UI", () => {
  it("renders all module tradeoffs and counterplay", () => {
    const html = renderTacticalModuleCards("shield-reinforcement", false);
    expect((html.match(/data-tactical-module-id=/g) ?? [])).toHaveLength(4);
    expect(html).toContain("收益");
    expect(html).toContain("代价");
    expect(html).toContain("反制");
    expect(html).toContain("aria-pressed=\"true\"");
  });

  it("locks every module while ready", () => {
    const html = renderTacticalModuleCards("healing-amplifier", true);
    expect((html.match(/ disabled/g) ?? [])).toHaveLength(4);
  });
});
