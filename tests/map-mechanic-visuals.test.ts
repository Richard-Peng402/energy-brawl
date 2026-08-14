import { describe, expect, it } from "vitest";

import {
  formatMechanicCountdown,
  mapMechanicLobbyView,
  mapMechanicMatchKey,
  mapMechanicPresentationProfile,
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
});

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
