import { describe, expect, it } from "vitest";

import {
  formatMechanicCountdown,
  mapMechanicLobbyView,
  mapMechanicMatchKey,
  mapMechanicPresentationProfile,
  mapMechanicRenderProfile,
  mapMechanicStatusText,
  mapMechanicVisualRevision,
  randomMapMechanicSummaries,
} from "../src/client/map-mechanic-visuals";
import type { GameSnapshot } from "../src/shared/protocol";

describe("map mechanic presentation", () => {
  it("formats fixed, disabled and random lobby explanations from the shared catalog", () => {
    expect(mapMechanicLobbyView("reactor-core", true)).toMatchObject({
      title: "核心泄压",
      timing: "预警 4 秒 · 生效 8 秒",
      disabled: false,
    });
    expect(mapMechanicLobbyView("neon-docks", false)).toMatchObject({
      title: "动态机制已关闭",
      disabled: true,
    });
    expect(randomMapMechanicSummaries()).toHaveLength(3);
    expect(randomMapMechanicSummaries().map((entry) => entry.title)).toEqual(["核心泄压", "轨道过载", "晶脉共鸣"]);
  });

  it("uses distinct high-contrast themes without changing render quality", () => {
    expect(mapMechanicPresentationProfile("reactor-vent")).toMatchObject({ tone: "danger", primary: "#ff7048" });
    expect(mapMechanicPresentationProfile("neon-overdrive")).toMatchObject({ tone: "boost", primary: "#37cfff" });
    expect(mapMechanicPresentationProfile("crystal-resonance")).toMatchObject({ tone: "support", primary: "#a978ff" });
  });

  it("formats countdowns and produces a stable duplicate-snapshot match key", () => {
    expect(formatMechanicCountdown(25_000, 21_200)).toBe("4 秒");
    expect(formatMechanicCountdown(25_000, 25_100)).toBe("0 秒");
    const first = snapshot({ serverTime: 10_000, remainingMs: 470_000 });
    const duplicate = snapshot({ serverTime: 10_050, remainingMs: 469_950 });
    const nextMatch = snapshot({ serverTime: 20_000, remainingMs: 480_000 });
    expect(mapMechanicMatchKey(first)).toBe(mapMechanicMatchKey(duplicate));
    expect(mapMechanicMatchKey(nextMatch)).not.toBe(mapMechanicMatchKey(first));
  });

  it("uses thick readable warning and active render profiles", () => {
    expect(mapMechanicRenderProfile("reactor-vent", "idle")).toBeNull();
    expect(mapMechanicRenderProfile("reactor-vent", "cooldown")).toBeNull();
    expect(mapMechanicRenderProfile("reactor-vent", "warning")).toMatchObject({ strokeWidth: 12, shapeMotion: "expand", fillAlpha: 0.08 });
    expect(mapMechanicRenderProfile("neon-overdrive", "active")).toMatchObject({ strokeWidth: 10, shapeMotion: "flow", primary: 0x37cfff });
    expect(mapMechanicRenderProfile("crystal-resonance", "active")).toMatchObject({ strokeWidth: 10, shapeMotion: "converge", primary: 0xa978ff });
  });

  it("formats warning, active and local crystal charge HUD copy", () => {
    const warning = mechanic({ kind: "reactor-vent", phase: "warning", phaseEndsAt: 25_000 });
    expect(mapMechanicStatusText(warning, "p1", 21_100)).toBe("核心泄压 · 4 秒后启动");
    expect(mapMechanicStatusText(mechanic({ kind: "neon-overdrive", phase: "active" }), "p1", 25_000)).toContain("移速 +12%");
    expect(mapMechanicStatusText(mechanic({ kind: "crystal-resonance", phase: "active", participants: [{ playerId: "p1", chargeProgress: 0.42, claimed: false }] }), "p1", 25_000)).toBe("晶脉共鸣 · 共鸣进度 42%");
  });

  it("keeps duplicate visual revisions stable and clears hidden phases", () => {
    const active = mechanic({ kind: "neon-overdrive", phase: "active", round: 1, zoneIndex: 1 });
    expect(mapMechanicVisualRevision(active)).toBe(mapMechanicVisualRevision({ ...active, phaseEndsAt: active.phaseEndsAt + 50 }));
    expect(mapMechanicVisualRevision(null)).toBe("hidden");
    expect(mapMechanicVisualRevision(mechanic({ phase: "cooldown" }))).toBe("hidden");
  });
});

function mechanic(overrides: Partial<NonNullable<GameSnapshot["mapMechanic"]>> = {}): NonNullable<GameSnapshot["mapMechanic"]> {
  return {
    kind: "reactor-vent",
    phase: "active",
    round: 0,
    zoneIndex: 0,
    zone: { kind: "circle", x: 1_440, y: 810, radius: 300 },
    phaseStartedAt: 24_000,
    phaseEndsAt: 32_000,
    participants: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<GameSnapshot>): GameSnapshot {
  return {
    serverTime: 0,
    phase: "playing",
    remainingMs: 480_000,
    overtimePlayerIds: [],
    winnerIds: [],
    holderId: null,
    holdRemainingMs: null,
    finishedAt: null,
    matchMvpId: null,
    matchMvpScore: null,
    players: [],
    projectiles: [],
    energy: [],
    skillOrbs: [],
    mapId: "reactor-core",
    mapMechanic: null,
    ...overrides,
  };
}
