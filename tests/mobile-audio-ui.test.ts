import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectLatestKillFeedback } from "../src/client/combat-feedback";

const app = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("mobile combat audio controls", () => {
  it("selects one latest kill and plays a recent local streak exactly once", () => {
    const feed = [
      { id: "kill-1", at: 1_000, killerId: "local", victimId: "enemy-a", streak: 1 },
      { id: "kill-2", at: 2_000, killerId: "local", victimId: "enemy-b", streak: 2 },
    ];
    expect(selectLatestKillFeedback(feed, "local", "kill-1", 2_400)).toEqual({ event: feed[1], streakToPlay: 2 });
    expect(selectLatestKillFeedback(feed, "local", "kill-2", 2_400)).toEqual({ event: feed[1], streakToPlay: null });
    expect(selectLatestKillFeedback(feed, "enemy-b", "kill-1", 2_400)).toEqual({ event: feed[1], streakToPlay: null });
    expect(selectLatestKillFeedback(feed, "local", "kill-1", 5_100)).toEqual({ event: feed[1], streakToPlay: null });
    expect(selectLatestKillFeedback([], "local", "", 100)).toEqual({ event: null, streakToPlay: null });
  });

  it("exposes the same sound toggle in the lobby header and battle HUD", () => {
    expect(app).toContain('<button class="sound-button" data-sound-toggle');
    expect(app).toContain('<button class="sound-button arena-sound" data-sound-toggle');
    expect(app).toContain('aria-label="关闭声音"');
  });

  it("keeps the sound button compact and outside the control sticks", () => {
    expect(styles).toContain(".sound-button");
    expect(styles).toContain(".arena-sound");
    expect(styles).toContain("pointer-events: auto");
  });

  it("offers persistent effects and ambience controls in the settings dialog", () => {
    expect(app).toContain('id="effects-volume" type="range"');
    expect(app).toContain('id="ambience-volume" type="range"');
    expect(app).toContain("this.audio.setEffectsLevel");
    expect(app).toContain("this.audio.setAmbienceLevel");
    expect(styles).toContain(".audio-mix-controls");
  });

  it("routes authoritative map phase edges to audio, haptics, and visual fallback", () => {
    expect(app).toContain("selectMapMechanicFeedback");
    expect(app).toContain("this.audio.playMapMechanic");
    expect(app).toContain("this.haptics.handleMapMechanicEvent");
    expect(styles).toContain('[data-combat-feedback="map-mechanic"]');
  });
});
