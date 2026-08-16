import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");
const hostApp = readFileSync(new URL("../src/client/host-app.ts", import.meta.url), "utf8");

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

  it("places a collapsed full-width diagnostics section below the main host layout", () => {
    expect(hostApp.indexOf('class="host-diagnostics"')).toBeGreaterThan(hostApp.indexOf('class="host-main"'));
    expect(hostApp).toContain("data-diagnostics-body hidden");
    expect(styles).toContain(".host-diagnostics-table-wrap");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain(".host-diagnostics-alerts");
  });

  it("keeps the host dashboard vertically scrollable inside the touch-locked app root", () => {
    const hostShell = extractBlock(styles, ".host-shell");

    expect(hostShell).toContain("height: 100dvh");
    expect(hostShell).toContain("overflow-x: hidden");
    expect(hostShell).toContain("overflow-y: auto");
  });

  it("shows every team player's identity in the host roster", () => {
    expect(hostApp).toContain('import { teamLabel } from "./team-label"');
    expect(hostApp).toContain("host-player-team");
    expect(hostApp).toContain("teamLabel(player.teamId)");
    expect(styles).toContain(".host-player-team");
  });

  it("places a server-backed dynamic-map switch beside the map selector", () => {
    expect(hostApp).toContain('id="host-map-mechanics"');
    expect(hostApp).toContain('id="host-map-mechanic-description"');
    expect(hostApp).toContain('{ type: "setMapMechanics", enabled: checkbox.checked }');
    expect(hostApp).toContain('checkbox.checked = room?.mapMechanicsEnabled ?? true');
    expect(hostApp).toContain('checkbox.disabled = !lobbyRulesEnabled');
  });

  it("shows the current or disabled map-mechanic explanation before start", () => {
    expect(hostApp).toContain("mapMechanicLobbyView");
    expect(hostApp).toContain("randomMapMechanicSummaries");
    expect(hostApp).toContain("动态机制已关闭");
    expect(hostApp).toContain("host-map-mechanic-description");
  });

  it("presents the finished-state reset command as a rematch action", () => {
    expect(hostApp).toContain("赛后重开");
    expect(hostApp).toContain("返回大厅重新选角");
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
