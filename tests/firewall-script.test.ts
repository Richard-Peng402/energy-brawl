import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("LAN firewall setup contract", () => {
  it("supports every Windows network profile while remaining local-subnet only", () => {
    const script = readFileSync(new URL("../scripts/setup-lan-firewall.ps1", import.meta.url), "utf8");
    expect(script).toContain("-Profile Any");
    expect(script).toContain("-RemoteAddress LocalSubnet");
    expect(script).toContain("-Protocol TCP");
    expect(script).toContain('-LocalPort "3000-3010"');
    expect(script).not.toMatch(/-RemoteAddress\s+(?:Any|\*)/i);
  });
});
