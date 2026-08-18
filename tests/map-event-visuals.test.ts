import { describe, expect, it } from "vitest";

import {
  MAX_MAP_EVENT_PARTICLES,
  createMapEventVisualState,
  mapEventLobbyView,
  mapEventStatusText,
  mapEventVisualModel,
  mapEventVisualRevision,
  selectMapEventFeedback,
  syncMapEventVisualState,
} from "../src/client/map-event-visuals";
import type { MapEventSnapshot } from "../src/shared/map-events";

describe("temporary map event presentation", () => {
  it("uses distinct warning shapes and readable Chinese labels", () => {
    expect(mapEventVisualModel(event("supply-drop")).shape).toBe("beacon");
    expect(mapEventVisualModel(event("area-lockdown")).shape).toBe("barrier-field");
    expect(mapEventVisualModel(event("global-scan")).shape).toBe("scan-ring");
    expect(mapEventVisualModel(event("energy-storm")).shape).toBe("storm-boundary");
    expect(mapEventVisualModel(event("global-scan")).label).toContain("扫描");
  });

  it("caps every pooled effect collection under repeated snapshots", () => {
    const layer = createMapEventVisualState();
    for (let index = 0; index < 500; index += 1) {
      syncMapEventVisualState(layer, event("global-scan", { eventSeq: index }));
    }
    expect(layer.particles.length).toBeLessThanOrEqual(MAX_MAP_EVENT_PARTICLES);
    expect(layer.particles).toHaveLength(MAX_MAP_EVENT_PARTICLES);
  });

  it("provides lobby counterplay and local active status without hiding controls", () => {
    expect(mapEventLobbyView(true)).toMatchObject({ enabled: true, title: "临时地图事件" });
    expect(mapEventLobbyView(true).summary).toContain("补给");
    expect(mapEventLobbyView(false)).toMatchObject({ enabled: false, title: "临时事件已关闭" });
    expect(mapEventStatusText(event("supply-drop", {
      phase: "active",
      participants: [{ playerId: "local", progress: 0.42 }],
    }), "local", 2_000)).toContain("42%");
    expect(mapEventStatusText(event("energy-storm", { phase: "active" }), "local", 2_000)).toContain("安全区");
  });

  it("uses stable revisions and emits feedback only on warning or active phase edges", () => {
    const warning = event("area-lockdown", { phase: "warning", eventSeq: 4 });
    const active = event("area-lockdown", { phase: "active", eventSeq: 4 });
    expect(mapEventVisualRevision(warning)).toBe(mapEventVisualRevision({ ...warning, phaseEndsAt: warning.phaseEndsAt + 50 }));
    expect(mapEventVisualRevision(event("area-lockdown", { phase: "cooldown" }))).toBe("hidden");
    expect(selectMapEventFeedback(null, warning, 1_000)).toMatchObject({ kind: "area-lockdown", stage: "warning" });
    expect(selectMapEventFeedback(warning, warning, 1_050)).toBeNull();
    expect(selectMapEventFeedback(warning, active, 5_000)).toMatchObject({ kind: "area-lockdown", stage: "active" });
  });

  it("treats the same event sequence in a new round as a new feedback event", () => {
    const previous = event("area-lockdown", { round: 1, eventSeq: 1, phase: "active" });
    const next = event("area-lockdown", { round: 2, eventSeq: 1, phase: "warning" });
    expect(selectMapEventFeedback(previous, next, 8_000)?.key).toBe("2:1:area-lockdown:warning");
    expect(mapEventVisualRevision(next)).toContain("round:2");
  });
});

function event(kind: MapEventSnapshot["kind"], overrides: Partial<MapEventSnapshot> = {}): MapEventSnapshot {
  const zone = kind === "area-lockdown"
    ? { kind: "rect" as const, x: 1_000, y: 600, width: 600, height: 180 }
    : kind === "energy-storm"
      ? { kind: "circle" as const, x: 1_440, y: 810, radius: 280 }
      : null;
  return {
    eventSeq: 1,
    kind,
    phase: "warning",
    round: 0,
    zone,
    point: kind === "supply-drop" ? { x: 1_440, y: 810 } : null,
    phaseStartedAt: 1_000,
    phaseEndsAt: 5_000,
    participants: [],
    ...overrides,
  };
}
