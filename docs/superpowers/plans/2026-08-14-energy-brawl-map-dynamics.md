# Energy Brawl Dynamic Map Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three distinct, server-authoritative dynamic map mechanics, pre-match explanations, a protected host toggle, AI awareness, synchronized high-fidelity visuals, and a 30-combination map/mode/on-off verification matrix without adding characters, assets, or a release version.

**Architecture:** A shared `map-mechanics` catalog is the single source for timings, geometry, numerical effects, descriptions, and visual themes. A focused server state machine advances phases and applies authoritative effects through the existing simulation/status-effect pipeline; room and game snapshots transport only low-frequency state. Lobby/host UI and Phaser rendering consume the shared catalog, while bot logic reads the same active-zone state.

**Tech Stack:** TypeScript, Vitest, Phaser 3, Socket.IO, Vite, Node.js 22, existing fixed-step simulation and object pools.

---

## Implementation order and commit boundaries

1. Preserve the already-verified host diagnostics fix.
2. Define the shared map-mechanic catalog and protocol contract.
3. Implement the pure lifecycle state machine.
4. Integrate reactor venting and environment damage.
5. Integrate neon overdrive and crystal resonance.
6. Add the protected host toggle and room state.
7. Add pre-match explanations and the opening banner.
8. Render map zones, HUD warnings, and radar markers.
9. Teach AI to avoid or pursue map zones.
10. Expand the 30-combination load matrix and complete browser/device QA.

No task changes `package.json` version, README release history, CHANGELOG, GitHub Release, or remote `main`.

## File map

### New files

- `src/shared/map-mechanics.ts`: map-specific definitions, descriptions, shapes, timings, numerical effects, and pure geometry helpers.
- `src/server/map-mechanic-system.ts`: authoritative lifecycle, zone selection, participant charge/claim state, and snapshot conversion.
- `src/client/map-mechanic-visuals.ts`: presentation profiles and pure visual/HUD formatting helpers.
- `tests/map-mechanics.test.ts`: shared catalog and geometry safety tests.
- `tests/map-mechanic-system.test.ts`: lifecycle, phase transitions, catch-up, and participant state tests.
- `tests/map-mechanic-visuals.test.ts`: visual profile, warning copy, and HUD formatting tests.

### Modified files

- `src/shared/protocol.ts`: room setting, host command, combat state IDs, and `GameSnapshot.mapMechanic` contract.
- `src/shared/map-catalog.ts`: expose shared spawn/pickup points to geometry validation without duplicating locations.
- `src/server/simulation.ts`: create, advance, apply, clear, and serialize authoritative map mechanics.
- `src/server/status-effects.ts`: add non-purifiable neon/crystal map states.
- `src/server/bot.ts`: danger avoidance and opportunistic overdrive/resonance path choice.
- `src/server/room.ts`: lobby setting, start-time propagation, snapshot field, and reset behavior.
- `src/server/host-admin.ts`: validate the new protected lobby-only command.
- `src/server/network.ts`: validate and route the new command through the existing authorized admin path.
- `src/client/host-app.ts`: host switch and complete current-map explanation.
- `src/client/mobile-app.ts`: lobby explanation card, opening banner, compact event HUD, and state cleanup.
- `src/client/game-scene.ts`: reusable Phaser zone objects and synchronized zone rendering.
- `src/client/tactical-radar.ts`: simplified active-zone projection.
- `src/client/render-throttle.ts`: include map-mechanic lobby/HUD revisions.
- `src/client/styles.css`: responsive host/lobby/banner/HUD presentation.
- `scripts/v4-load-test.ts`: mechanism-on/off matrix metrics.
- Relevant existing tests listed in each task.

## Task 0: Preserve the verified diagnostics fix

**Files:**
- Existing modifications: `src/client/host-app.ts`
- Existing modifications: `src/client/host-diagnostics-view.ts`
- Existing modifications: `src/client/styles.css`
- Existing modifications: `tests/host-diagnostics-view.test.ts`
- Existing modifications: `tests/host-layout.test.ts`

- [ ] **Step 1: Confirm the working tree contains only the known diagnostics fix plus planning documents**

Run:

```powershell
git status --short
git diff -- src/client/host-app.ts src/client/host-diagnostics-view.ts src/client/styles.css tests/host-diagnostics-view.test.ts tests/host-layout.test.ts
```

Expected: the five files contain only host-shell scrolling and completed-report fallback changes; no map-mechanic production code exists yet.

- [ ] **Step 2: Re-run the focused diagnostics regression**

Run:

```powershell
npm.cmd test -- --run tests/host-layout.test.ts tests/host-diagnostics-view.test.ts tests/diagnostics-session.test.ts tests/diagnostics-authorization.test.ts tests/diagnostics-report-store.test.ts
```

Expected: 5 test files and 19 tests pass.

- [ ] **Step 3: Commit only the existing diagnostics fix**

```powershell
git add src/client/host-app.ts src/client/host-diagnostics-view.ts src/client/styles.css tests/host-diagnostics-view.test.ts tests/host-layout.test.ts
git commit -m "fix: keep host diagnostics visible after matches"
```

Expected: planning documents remain committed separately and the worktree becomes clean before feature edits.

## Task 1: Define the shared catalog and network contract

**Files:**
- Create: `src/shared/map-mechanics.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/shared/map-catalog.ts`
- Create: `tests/map-mechanics.test.ts`
- Modify: `tests/map-catalog.test.ts`
- Modify: `tests/diagnostics-contract.test.ts`

- [ ] **Step 1: Write failing catalog and geometry tests**

Create `tests/map-mechanics.test.ts` with assertions equivalent to:

```ts
import { describe, expect, it } from "vitest";
import { MAP_MECHANICS, getMapMechanicDefinition, zoneContainsPoint } from "../src/shared/map-mechanics";
import { MAP_CATALOG } from "../src/shared/map-catalog";
import { circleHitsRect } from "../src/shared/math";
import { PLAYER_RADIUS } from "../src/shared/constants";

describe("dynamic map mechanic catalog", () => {
  it("defines a distinct mechanic for every map", () => {
    expect(Object.keys(MAP_MECHANICS)).toEqual(["reactor-core", "neon-docks", "crystal-ruins"]);
    expect(new Set(Object.values(MAP_MECHANICS).map((entry) => entry.kind)).size).toBe(3);
    expect(getMapMechanicDefinition("reactor-core")).toMatchObject({ kind: "reactor-vent", firstWarningDelayMs: 20_000, warningMs: 4_000, activeMs: 8_000, cooldownMs: 20_000 });
  });

  it("keeps every configured zone away from spawn and pickup centers and out of walls", () => {
    for (const map of MAP_CATALOG) {
      const definition = getMapMechanicDefinition(map.id);
      for (const zone of definition.zones) {
        for (const point of [...map.spawnPoints, ...map.energySpawnPoints, ...map.skillOrbSpawnPoints]) {
          expect(zoneContainsPoint(zone, point, PLAYER_RADIUS + 36)).toBe(false);
        }
        expect(map.walls.some((wall) => zone.kind === "circle" && circleHitsRect(zone, zone.radius, wall))).toBe(false);
      }
    }
  });
});
```

For the reactor circle, validate only the explicitly declared safe spawn/pickup exclusion anchors rather than rejecting intentional capture-point overlap. For rectangular neon and crystal zones, validate each shape against wall rectangles with the catalog helper.

- [ ] **Step 2: Run the new tests and verify the expected failure**

Run:

```powershell
npm.cmd test -- --run tests/map-mechanics.test.ts tests/map-catalog.test.ts tests/diagnostics-contract.test.ts
```

Expected: FAIL because `src/shared/map-mechanics.ts` and the new protocol fields do not exist.

- [ ] **Step 3: Add concrete shared types and configuration**

Implement these exported contracts in `src/shared/map-mechanics.ts`:

```ts
export type MapMechanicKind = "reactor-vent" | "neon-overdrive" | "crystal-resonance";
export type MapMechanicPhase = "idle" | "warning" | "active" | "cooldown";
export type MapMechanicZone =
  | { kind: "circle"; x: number; y: number; radius: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number };

export interface MapMechanicDefinition {
  mapId: MapId;
  kind: MapMechanicKind;
  name: string;
  summary: string;
  counterplay: string;
  firstWarningDelayMs: 20_000;
  warningMs: 4_000;
  activeMs: 8_000;
  cooldownMs: 20_000;
  zones: readonly MapMechanicZone[];
  effect: Readonly<Record<string, number>>;
}
```

Use these exact effects:

```ts
reactor: { damagePerSecond: 8, damageTickMs: 1_000 }
neon: { moveMultiplier: 1.12, fireCooldownMultiplier: 0.90, projectileSpeedMultiplier: 1.15, graceMs: 1_000 }
crystal: { chargeMs: 1_250, durationMs: 6_000, damageTakenMultiplier: 0.85, healingPerSecond: 3 }
```

Declare reactor as one circle at `{ x: 1440, y: 810, radius: 300 }`; declare two non-wall neon corridor rectangles and four non-wall crystal circles using coordinates verified by the new geometry tests. Export `getMapMechanicDefinition`, `zoneContainsPoint`, `zoneBounds`, and `mapMechanicLobbyDescription`.

Extend `src/shared/protocol.ts` with:

```ts
export type CombatStateId = ExistingCombatStateId | "neon-overdrive" | "crystal-resonance";

export interface MapMechanicParticipantSnapshot {
  playerId: string;
  chargeProgress: number;
  claimed: boolean;
}

export interface MapMechanicSnapshot {
  kind: MapMechanicKind;
  phase: MapMechanicPhase;
  round: number;
  zoneIndex: number;
  zone: MapMechanicZone;
  phaseStartedAt: number;
  phaseEndsAt: number;
  participants: MapMechanicParticipantSnapshot[];
}
```

Add `mapMechanicsEnabled: boolean` to `RoomSnapshot`, `mapMechanic: MapMechanicSnapshot | null` to `GameSnapshot`, and `{ type: "setMapMechanics"; enabled: boolean }` to `HostAdminCommand`.

- [ ] **Step 4: Run catalog and contract tests**

Run the same command from Step 2.

Expected: all tests pass; all configured zones pass the wall/spawn/pickup safety assertions.

- [ ] **Step 5: Commit the shared contract**

```powershell
git add src/shared/map-mechanics.ts src/shared/protocol.ts src/shared/map-catalog.ts tests/map-mechanics.test.ts tests/map-catalog.test.ts tests/diagnostics-contract.test.ts
git commit -m "feat: define distinct dynamic map mechanics"
```

## Task 2: Implement the pure lifecycle state machine

**Files:**
- Create: `src/server/map-mechanic-system.ts`
- Create: `tests/map-mechanic-system.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Cover exact boundary times:

```ts
const state = createMapMechanicState("neon-docks", 1_000, true);
expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "idle", phaseEndsAt: 21_000, round: 0, zoneIndex: 0 });
advanceMapMechanicState(state, 21_000);
expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "warning", phaseEndsAt: 25_000, zoneIndex: 0 });
advanceMapMechanicState(state, 25_000);
expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "active", phaseEndsAt: 33_000 });
advanceMapMechanicState(state, 33_000);
expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "cooldown", phaseEndsAt: 53_000 });
advanceMapMechanicState(state, 53_000);
expect(mapMechanicSnapshot(state)).toMatchObject({ phase: "warning", round: 1, zoneIndex: 1 });
```

Also test a single jump from `1_000` to `90_000`, disabled state returning `null`, overtime blocking new warning transitions, participant charge reset on leaving a zone, and crystal claim remaining single-use for one active round.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm.cmd test -- --run tests/map-mechanic-system.test.ts
```

Expected: FAIL because the state-machine module does not exist.

- [ ] **Step 3: Implement the minimal deterministic state machine**

Export:

```ts
export interface MapMechanicState {
  definition: MapMechanicDefinition;
  phase: MapMechanicPhase;
  round: number;
  zoneIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  participantChargeStartedAt: Map<string, number>;
  claimedPlayerIds: Set<string>;
  reactorDamageAt: Map<string, number>;
}

export function createMapMechanicState(mapId: MapId, now: number, enabled: boolean): MapMechanicState | null;
export function advanceMapMechanicState(state: MapMechanicState, now: number, allowNewEvent: boolean): void;
export function updateCrystalParticipant(state: MapMechanicState, playerId: string, inside: boolean, now: number): boolean;
export function mapMechanicSnapshot(state: MapMechanicState): MapMechanicSnapshot;
```

Advance phases with a bounded `while (now >= state.phaseEndsAt)` loop so large fixed-loop catch-up deltas do not skip transitions. Clear round-local charge, claim, and damage tick maps whenever an active phase ends. Zone selection is `round % definition.zones.length`, making neon alternate and crystal rotate deterministically.

- [ ] **Step 4: Run lifecycle tests**

Run the Step 2 command.

Expected: all lifecycle, catch-up, overtime, charge, and single-claim tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/server/map-mechanic-system.ts tests/map-mechanic-system.test.ts
git commit -m "feat: add deterministic map mechanic lifecycle"
```

## Task 3: Integrate reactor venting and environment damage

**Files:**
- Modify: `src/server/simulation.ts`
- Modify: `src/server/room.ts`
- Modify: `tests/simulation.test.ts`
- Modify: `tests/room.test.ts`

- [ ] **Step 1: Write failing authoritative reactor tests**

Add real `GameWorld` tests proving:

```ts
const world = createGameWorld(seeds, 0, "solo", "reactor-core", { mapMechanicsEnabled: true });
const target = world.players.get("p1")!;
target.x = 1_440; target.y = 810; target.shieldUntil = 0;
stepWorld(world, 20_000 + 4_000 + 1_000);
expect(target.health).toBe(target.maxHealth - 8);
expect(target.lastCombatAt).toBe(world.now);
expect(world.players.get("p2")!.score).toBe(0);
```

Cover: warning causes no damage; one-second ticks do not duplicate; outside player is untouched; spawn shield blocks damage; full eight seconds cannot kill the 88-health phase sniper; forced finish prevents further damage; reset creates a fresh state; snapshot exposes phase, zone, and timestamps.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- --run tests/simulation.test.ts tests/room.test.ts
```

Expected: FAIL because `createGameWorld` has no mechanic option and snapshots have no mechanic state.

- [ ] **Step 3: Add the authoritative integration point**

Add `mapMechanicState: MapMechanicState | null` and `mapMechanicsEnabled: boolean` to `GameWorld`. Extend `createGameWorld` with an options object after `mapId`:

```ts
export interface CreateGameWorldOptions { mapMechanicsEnabled?: boolean }
```

Default `mapMechanicsEnabled` to `true`. In `stepWorld`, after movement/separation and before firing, call a focused `advanceWorldMapMechanic(world, simulationDelta)`.

Refactor player damage through one internal function accepting `attackerId: string | null`. Existing `damagePlayer` continues passing a real attacker ID; reactor venting passes `null`. Environment death clears recent damage sources, creates no kill-feed entry, awards no score/kill/assist, and still performs the normal death/respawn/status cleanup.

Use `reactorDamageAt` to apply exactly 8 damage per completed 1,000ms active interval. Call `markCombat` on the victim so regeneration restarts.

Serialize `mapMechanicState` using `mapMechanicSnapshot`; return `null` when disabled.

- [ ] **Step 4: Run authoritative regressions**

```powershell
npm.cmd test -- --run tests/simulation.test.ts tests/room.test.ts tests/collision.test.ts tests/match-results.test.ts tests/combat-feedback.test.ts
```

Expected: reactor tests pass; existing player kills, assists, respawns, results, and collision tests remain green.

- [ ] **Step 5: Commit**

```powershell
git add src/server/simulation.ts src/server/room.ts tests/simulation.test.ts tests/room.test.ts
git commit -m "feat: add reactor core venting hazard"
```

## Task 4: Integrate neon overdrive and crystal resonance

**Files:**
- Modify: `src/server/status-effects.ts`
- Modify: `src/server/simulation.ts`
- Modify: `tests/status-effects.test.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: Write failing neon and crystal tests**

Test neon with a player inside the active rectangle:

```ts
expect(player.vx).toBeCloseTo(player.moveSpeed * 1.12);
expect(player.nextFireAt - world.now).toBeCloseTo(player.fireCooldownMs * 0.90);
expect(Math.hypot(projectile.vx, projectile.vy)).toBeCloseTo(player.projectileSpeed * 1.15);
```

Then move the player outside and verify the status lasts exactly 1,000ms, refreshes rather than stacks, and combines multiplicatively with capacitor overload, runner movement, bulwark suppression, and host-overridden base values.

Test crystal: 1,249ms inside is insufficient; 1,250ms grants one six-second state; leaving before completion resets charge; the same active round cannot grant twice; healing is 3 per second and capped at max health; damage is multiplied by 0.85; death clears the state; a later round can grant again. Assert actual map healing enters `healingDone` and final damage never drops below the shared minimum.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- --run tests/status-effects.test.ts tests/simulation.test.ts
```

Expected: FAIL because map status IDs and their movement/fire/damage/heal rules are absent.

- [ ] **Step 3: Add map status lifecycle and effect helpers**

Add `neon-overdrive` and `crystal-resonance` to the non-purifiable `CombatStateId` set. Keep `bulwark-suppression` as the only purifiable map-relevant status.

Extract small helpers in `simulation.ts`:

```ts
function effectiveMoveMultiplier(world: GameWorld, player: WorldPlayer): number;
function effectiveFireCooldownMultiplier(world: GameWorld, player: WorldPlayer): number;
function effectiveProjectileSpeedMultiplier(world: GameWorld, player: WorldPlayer): number;
function effectiveDamageTakenMultiplier(world: GameWorld, player: WorldPlayer, attacker: WorldPlayer | undefined): number;
```

Each helper starts from the current player authority values and composes existing exclusive effects, suppression, and the new map state once. Do not copy base character constants.

During active neon phases, refresh `neon-overdrive` to `world.now + 1_000` for players inside. During active crystal phases, call `updateCrystalParticipant`; on claim, add `crystal-resonance` for 6,000ms. Apply crystal healing with a per-player accumulator and record only actual restored health.

- [ ] **Step 4: Run combat and host-override regressions**

```powershell
npm.cmd test -- --run tests/status-effects.test.ts tests/simulation.test.ts tests/exclusive-skill-system.test.ts tests/host-admin.test.ts tests/character-balance.test.ts
```

Expected: all map, character, exclusive skill, purification, and host override tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/server/status-effects.ts src/server/simulation.ts tests/status-effects.test.ts tests/simulation.test.ts
git commit -m "feat: add neon and crystal map effects"
```

## Task 5: Add the protected host toggle and room propagation

**Files:**
- Modify: `src/server/room.ts`
- Modify: `src/server/host-admin.ts`
- Modify: `src/server/network.ts`
- Modify: `src/client/host-app.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `tests/room.test.ts`
- Modify: `tests/host-admin.test.ts`
- Modify: `tests/network.test.ts`
- Modify: `tests/host-layout.test.ts`

- [ ] **Step 1: Write failing authorization and lifecycle tests**

Cover:

```ts
expect(room.snapshot().mapMechanicsEnabled).toBe(true);
expect(room.applyHostAdminCommand({ type: "setMapMechanics", enabled: false })).toEqual({ ok: true });
expect(room.snapshot().mapMechanicsEnabled).toBe(false);
expect(room.startMatch()).toEqual({ ok: true });
expect(room.gameSnapshot()?.mapMechanic).toBeNull();
expect(room.applyHostAdminCommand({ type: "setMapMechanics", enabled: true })).toMatchObject({ ok: false });
```

Network tests must reject malformed values, reject non-loopback/invalid-token commands through the existing authorization layer, broadcast the changed room snapshot only after server application, and preserve the chosen setting after return to lobby.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- --run tests/room.test.ts tests/host-admin.test.ts tests/network.test.ts tests/host-layout.test.ts
```

Expected: FAIL because the command, setting, switch, and validator are missing.

- [ ] **Step 3: Implement server setting and host control**

Add `private mapMechanicsEnabled = true` to `GameRoom`; add a lobby-only setter; pass it into `createGameWorld`; include it in every `RoomSnapshot`; retain it through `resetToLobby` and continuous matches.

Extend `isHostAdminCommand` to accept only a real boolean. Route the command through `applyHostAdminCommand` before the generic player-ID validation branch.

Add this control beside the map selector in `host-app.ts`:

```html
<label class="host-map-mechanic-control">
  <input id="host-map-mechanics" type="checkbox" checked />
  动态地图机制
</label>
<p id="host-map-mechanic-description"></p>
```

Disable the checkbox outside the lobby. On change, send `{ type: "setMapMechanics", enabled: checkbox.checked }`; render checked state only from the next room snapshot.

- [ ] **Step 4: Run server and host UI regressions**

Run the Step 2 command.

Expected: setting, authorization, broadcast ordering, persistence, and layout tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/server/room.ts src/server/host-admin.ts src/server/network.ts src/client/host-app.ts src/shared/protocol.ts tests/room.test.ts tests/host-admin.test.ts tests/network.test.ts tests/host-layout.test.ts
git commit -m "feat: add protected map mechanic host toggle"
```

## Task 6: Show the mechanism before the match starts

**Files:**
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/render-throttle.ts`
- Modify: `src/client/styles.css`
- Modify: `src/client/host-app.ts`
- Modify: `tests/mobile-layout.test.ts`
- Modify: `tests/mobile-viewport.test.ts`
- Modify: `tests/host-layout.test.ts`
- Create: `tests/map-mechanic-visuals.test.ts`
- Create: `src/client/map-mechanic-visuals.ts`

- [ ] **Step 1: Write failing explanation and responsive-layout tests**

Test the pure formatter:

```ts
expect(mapMechanicLobbyView("reactor-core", true)).toMatchObject({ title: "核心泄压", timing: "预警 4 秒 · 生效 8 秒", disabled: false });
expect(mapMechanicLobbyView("neon-docks", false)).toMatchObject({ title: "动态机制已关闭", disabled: true });
expect(randomMapMechanicSummaries()).toHaveLength(3);
```

Static UI tests must find `data-map-mechanic-card` in the player lobby, the host description, the enabled/disabled copy, and CSS that caps the phone card to three body lines without overlapping `#ready-button`, `.character-selection-stage`, or `.roster-panel` at 844×390 and 932×430.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- --run tests/map-mechanic-visuals.test.ts tests/mobile-layout.test.ts tests/mobile-viewport.test.ts tests/host-layout.test.ts
```

Expected: FAIL because the formatter and UI surfaces do not exist.

- [ ] **Step 3: Implement shared presentation and lobby card**

In `src/client/map-mechanic-visuals.ts`, export `mapMechanicLobbyView`, `randomMapMechanicSummaries`, `formatMechanicCountdown`, and a distinct presentation profile per kind. All labels and values come from `src/shared/map-mechanics.ts`.

Add a compact card to the existing lobby workspace. Fixed maps show one mechanism with counterplay; random selection shows three one-line summaries before start. Disabled state shows only “动态机制已关闭”. Include `mapSelection` and `mapMechanicsEnabled` in `roomUiRevision` so changes render immediately.

On transition into a game, show a three-second non-blocking banner containing actual map name, mechanism name, and `20 秒后首次预警`. Use an edge-triggered match key (`mapId + serverTime epoch`) so reconnect and duplicate snapshots do not replay it continuously.

- [ ] **Step 4: Run UI tests**

Run the Step 2 command.

Expected: copy, random summaries, disabled state, opening banner, and mobile layout contracts pass.

- [ ] **Step 5: Commit**

```powershell
git add src/client/map-mechanic-visuals.ts src/client/mobile-app.ts src/client/render-throttle.ts src/client/styles.css src/client/host-app.ts tests/map-mechanic-visuals.test.ts tests/mobile-layout.test.ts tests/mobile-viewport.test.ts tests/host-layout.test.ts
git commit -m "feat: explain map mechanics before matches"
```

## Task 7: Render synchronized zones, HUD warnings, and radar markers

**Files:**
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/tactical-radar.ts`
- Modify: `src/client/styles.css`
- Modify: `tests/map-mechanic-visuals.test.ts`
- Modify: `tests/tactical-radar.test.ts`
- Modify: `tests/tactical-hud-ui.test.ts`
- Modify: `tests/effect-pool.test.ts`

- [ ] **Step 1: Write failing render-state tests**

Test that:

- disabled/idle/cooldown returns no active zone layer;
- warning uses a thick solid boundary, lower fill alpha, scan motion, and countdown copy;
- active reactor is orange-red, neon is blue-magenta with directional flow, crystal is purple-cyan with inward particles;
- radar projection receives one current zone and never exposes a future zone;
- duplicate snapshots do not recreate Phaser objects;
- finished/reset snapshots clear all zone views.

Use pure profiles such as:

```ts
expect(mapMechanicRenderProfile("reactor-vent", "warning")).toMatchObject({ strokeWidth: 12, shapeMotion: "expand" });
expect(mapMechanicRenderProfile("neon-overdrive", "active")).toMatchObject({ strokeWidth: 10, shapeMotion: "flow" });
expect(mapMechanicRenderProfile("crystal-resonance", "active")).toMatchObject({ strokeWidth: 10, shapeMotion: "converge" });
```

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- --run tests/map-mechanic-visuals.test.ts tests/tactical-radar.test.ts tests/tactical-hud-ui.test.ts tests/effect-pool.test.ts
```

Expected: FAIL because render profiles and scene/radar integration are absent.

- [ ] **Step 3: Implement reusable high-fidelity rendering**

Add one persistent `Phaser.GameObjects.Graphics`, one pulse shape, and a small fixed object pool of existing spark/smoke/trace images to `ArenaScene`. Create them once in `create()`, update from `snapshot.mapMechanic`, and hide/return pool objects on idle/cooldown/finished/reset.

Do not load new assets. Reuse map light/decal textures and existing projectile/combat particle assets. Set zone layers below players/projectiles but above the floor; keep aim corridor and skill indicators above zones.

Add `#map-mechanic-status` to the HUD. During warning show `机制名 · N 秒后启动`; during active show concise effect copy; during crystal charging show only the local player’s progress. Add the current active/warning zone to tactical radar with a single simplified outline.

- [ ] **Step 4: Run render regressions**

```powershell
npm.cmd test -- --run tests/map-mechanic-visuals.test.ts tests/tactical-radar.test.ts tests/tactical-hud-ui.test.ts tests/effect-pool.test.ts tests/aim-guide.test.ts tests/skill-indicator.test.ts tests/render-quality.test.ts
```

Expected: all tests pass; thick map boundaries do not change aim-guide thickness or hide skill indicators.

- [ ] **Step 5: Commit**

```powershell
git add src/client/game-scene.ts src/client/mobile-app.ts src/client/tactical-radar.ts src/client/styles.css tests/map-mechanic-visuals.test.ts tests/tactical-radar.test.ts tests/tactical-hud-ui.test.ts tests/effect-pool.test.ts
git commit -m "feat: render synchronized dynamic map zones"
```

## Task 8: Add AI danger avoidance and zone pursuit

**Files:**
- Modify: `src/server/bot.ts`
- Modify: `tests/bot.test.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: Write failing bot decisions**

Create deterministic worlds proving:

- a bot inside reactor warning/active moves toward the closest safe point rather than the enemy, energy, skill orb, or capture point;
- a bot does not oscillate at the reactor boundary across consecutive decisions;
- a healthy bot uses the active neon lane when it shortens a route to a target;
- a low-health bot prioritizes crystal resonance when friendly/enemy occupancy is safe;
- a low-health bot retreats from an outnumbered crystal zone;
- team target filtering remains unchanged and bots never aim/fire at teammates.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- --run tests/bot.test.ts tests/simulation.test.ts tests/team-system.test.ts
```

Expected: FAIL because bot scoring does not inspect map-mechanic state.

- [ ] **Step 3: Add a bounded map-zone utility score**

Before existing capture/orb/enemy selection, calculate:

```ts
const reactorEscape = activeDangerEscapeVector(world, player);
const mapOpportunity = bestMapOpportunity(world, player, enemies);
```

Reactor warning/active escape has highest movement priority. Neon is a route preference, not a mandatory destination. Crystal has a positive score only when health is at most 65% or friendly occupancy is not outnumbered. Use a 48-unit hysteresis band around zone edges to prevent alternating decisions.

Keep aim and fire selection based only on `selectCombatTarget`, preserving team safety.

- [ ] **Step 4: Run AI and team regressions**

Run the Step 2 command.

Expected: map decisions pass; all existing AI difficulty, team targeting, and friendly-fire tests remain green.

- [ ] **Step 5: Commit**

```powershell
git add src/server/bot.ts tests/bot.test.ts tests/simulation.test.ts
git commit -m "feat: teach bots dynamic map counterplay"
```

## Task 9: Build the 30-combination pressure matrix

**Files:**
- Modify: `scripts/v4-load-test.ts`
- Modify: `tests/v4-load-test.test.ts`
- Modify: `tests/performance.test.ts`
- Modify: `tests/network.test.ts`

- [ ] **Step 1: Write failing report-contract tests**

Extend `V4LoadReport` with:

```ts
mapMechanicsEnabled: boolean;
mechanicWarnings: number;
mechanicActivations: number;
illegalZoneOverlaps: number;
expiredMapStates: number;
postFinishApplications: number;
snapshotBytesP95: number;
```

Test all 30 combinations:

```ts
for (const mapId of MAP_IDS) {
  for (const mode of MATCH_MODES) {
    for (const enabled of [true, false]) {
      const report = runV4LoadSimulation(70, mode, mapId, { mapMechanicsEnabled: enabled });
      expect(validateV4LoadReport(report)).toEqual([]);
    }
  }
}
```

Enabled 70-second runs must observe at least two warnings and two activations; disabled runs must observe zero. Both must report zero wall violations, illegal overlaps, expired map states, post-finish applications, and friendly-fire regressions.

- [ ] **Step 2: Run and verify failure**

```powershell
npm.cmd test -- --run tests/v4-load-test.test.ts tests/performance.test.ts tests/network.test.ts
```

Expected: FAIL because load options and mechanic metrics are absent.

- [ ] **Step 3: Extend the load harness without lowering fidelity**

Add the enabled option, host-setting call before start, event counters from snapshots, zone-vs-wall/spawn/pickup validation, status expiry validation, post-finish guard, and serialized snapshot-size sampling. Keep six clients, existing movement/fire/skill activity, `SERVER_TICK_MS`, and all current wall/capture diagnostics.

Do not reduce simulated players, snapshot frequency, particle policy, or test assertions. Use shorter targeted unit runs for ordinary Vitest and retain a separate exact 70-second matrix command for the final gate:

```powershell
$env:V4_LOAD_SECONDS='70'
npm.cmd run load-test:v4
```

- [ ] **Step 4: Run targeted and full matrix tests**

Run the Step 2 command, then the 70-second command.

Expected: 30 reports; enabled reports observe events; disabled reports observe none; every safety/performance error array is empty.

- [ ] **Step 5: Commit**

```powershell
git add scripts/v4-load-test.ts tests/v4-load-test.test.ts tests/performance.test.ts tests/network.test.ts
git commit -m "test: cover dynamic maps across all modes"
```

## Task 10: Browser QA, device review, and final verification

**Files:**
- Modify only files required by failures discovered during this task.
- Do not modify version or release documentation.

- [ ] **Step 1: Run the complete automated gate**

Run each command separately and retain its exit code/output:

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run assets:v3
npm.cmd run assets:v4
npm.cmd run build
npm.cmd run doctor
npm.cmd run smoke:clean-clone
git diff --check
```

Expected: every command exits 0; all 30 map/mode/on-off combinations remain covered; asset counts remain unchanged because no new assets were added.

- [ ] **Step 2: Verify the complete host/player flow in a browser**

The flow under test is:

```text
/host -> select each fixed map -> read mechanism description -> disable/enable -> player lobby receives matching description -> start -> opening banner -> warning -> active zone -> finish -> return lobby
```

For random selection, verify the lobby lists three summaries and the opening banner switches to the actual server-selected map. For every state, verify page identity, nonblank DOM, no framework overlay, no relevant console warnings/errors, and a screenshot.

- [ ] **Step 3: Perform three-map combat visual review**

For each map capture warning and active screenshots at desktop 1280×720, phone landscape 844×390, iPhone landscape 932×430, and one tablet landscape viewport. Check:

- reactor boundary is thick, readable, and does not hide the capture point or aim line;
- neon flow clearly shows which corridor is active;
- crystal charge/readiness is understandable without relying only on color;
- opening banner and compact HUD avoid both joysticks and skill buttons;
- players, bullets, trails, skill effects, kill feed, radar, and map zones retain correct layer order;
- the host page remains vertically scrollable and completed diagnostics remain visible.

- [ ] **Step 4: Run a real six-client soak**

Run at least one 30-minute mixed-map continuous session with mechanisms enabled. Include desktop and available phone/tablet clients. Export the host diagnostic report and inspect RTT, input acknowledgement P95, longest frame, corrections, reconnects, server step P95, and rejected samples. Record any unavailable physical device/browser as remaining risk rather than claiming it was tested.

- [ ] **Step 5: Fix only evidence-backed failures using TDD**

For every issue found, add the smallest failing test, run it to show the expected failure, implement the minimal fix, rerun the focused test, then repeat the complete gate affected by that change. Do not bundle unrelated visual redesigns or balance changes.

- [ ] **Step 6: Commit final QA fixes without releasing**

Stage only expected map-mechanic and regression files, then:

```powershell
git commit -m "fix: harden dynamic map mechanics"
```

If Step 5 produced no code changes, omit this commit. Do not push, change the version, or edit release notes.

## Plan self-review

- [x] Three maps have separate rules, effects, geometry, visuals, counterplay, and AI behavior.
- [x] Host enable/disable is server-authoritative, lobby-only, persisted across lobby resets, and tested through the network path.
- [x] Player and host pre-match explanations, random-map summaries, disabled copy, and opening banner are covered.
- [x] Reactor environment damage, neon multipliers, crystal charge/heal/reduction, death/reset/finish cleanup, and host override composition are covered.
- [x] No terrain or wall mutation is introduced; geometry validation checks zones against walls, spawns, energy, and skill-orb points.
- [x] Reconnect, robot takeover, friendly-fire safety, interpolation consistency, and post-finish cleanup are covered.
- [x] The 3 maps × 5 modes × enabled/disabled matrix is an explicit 30-combination gate.
- [x] Highest render quality, full effects, existing input/snapshot rates, and unchanged asset set are explicit constraints.
- [x] Browser visual QA includes host scrolling/diagnostics regression and desktop/phone/tablet layouts.
- [x] Current uncommitted diagnostics work is preserved before map implementation.
- [x] Version number, release notes, remote push, and new characters/assets are excluded.
- [x] The plan contains no unresolved placeholders or undefined task handoffs.
