import { describe, expect, it } from "vitest";

import {
  checkFirewallRule,
  checkNetworkSnapshot,
  checkNodeVersion,
  checkPackageVersions,
  validateRuntimeAssets,
} from "../scripts/release-doctor";

describe("release doctor checks", () => {
  it("requires Node.js 22 or newer", () => {
    expect(checkNodeVersion("v22.17.0").ok).toBe(true);
    expect(checkNodeVersion("v20.19.0")).toMatchObject({ ok: false });
  });

  it("requires package and root lockfile versions to match", () => {
    expect(checkPackageVersions({ version: "4.2.3" }, { packages: { "": { version: "4.2.3" } } }).ok).toBe(true);
    expect(checkPackageVersions({ version: "4.2.3" }, { packages: { "": { version: "4.2.2" } } }).ok).toBe(false);
  });

  it("rejects missing or developer-external runtime assets", () => {
    const entries = [{ outputFiles: ["/assets/v3/characters/blaze.png", "D:/MyPicture/blaze.png"] }];
    const result = validateRuntimeAssets(entries, new Set(["public/assets/v3/characters/blaze.png"]));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("D:/MyPicture");
  });

  it("provides actionable network and firewall repair instructions", () => {
    const network = checkNetworkSnapshot({
      revision: "none", checkedAt: 1, status: "unavailable", primaryUrl: null, candidates: [], warnings: [],
    });
    expect(network.ok).toBe(false);
    expect(network.message).toContain("同一局域网");

    const firewall = checkFirewallRule("win32", { exists: false });
    expect(firewall.ok).toBe(false);
    expect(firewall.message).toContain("setup-lan-firewall.ps1");
  });

  it("rejects an existing but outdated Private-only firewall rule", () => {
    expect(checkFirewallRule("win32", {
      exists: true,
      profile: "Private",
      protocol: "TCP",
      localPort: "3000-3010",
      remoteAddresses: ["LocalSubnet"],
    }).ok).toBe(false);
    expect(checkFirewallRule("win32", {
      exists: true,
      profile: "Any",
      protocol: "TCP",
      localPort: "3000-3010",
      remoteAddresses: ["LocalSubnet"],
    }).ok).toBe(true);
    expect(checkFirewallRule("win32", {
      exists: true,
      profile: "Any",
      protocol: "TCP",
      localPort: "3000-3010",
      remoteAddresses: ["Any", "LocalSubnet"],
    }).ok).toBe(false);
  });
});
