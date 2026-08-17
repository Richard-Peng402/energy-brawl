# Tactical Modules, Map Events, Highlights, and Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add balanced pre-match tactical modules, four authoritative temporary map events, post-match highlights, persistent host presets, configurable bot behavior, and deterministic network-fault coverage without lowering rendering or network quality.

**Architecture:** Keep all gameplay decisions server-authoritative. Add small shared catalogs and pure rule modules, integrate them through `GameRoom` and `GameWorld`, and keep the existing client entry files responsible only for rendering and event wiring. Store host presets locally, but validate and apply them atomically on the server.

**Tech Stack:** TypeScript 5.9, Socket.IO 4.8, Phaser 3.90, Vite 7, Vitest 3, Playwright-driven smoke scripts, Web Audio, CSS.

---

## File Structure

### New shared modules

- `src/shared/tactical-module-catalog.ts`: module IDs, copy, default selection, and validation.
- `src/shared/bot-difficulty.ts`: bot difficulty type, labels, and behavior profiles.
- `src/shared/map-events.ts`: temporary-event definitions, snapshots, geometry, and lobby descriptions.
- `src/shared/match-highlights.ts`: highlight types, ordering, and display data.
- `src/shared/room-presets.ts`: versioned preset schema, limits, and structural validation.

### New server modules

- `src/server/tactical-modules.ts`: pure derived-stat and effect modifier functions.
- `src/server/map-event-system.ts`: deterministic temporary-event state machine.
- `src/server/match-highlight-tracker.ts`: bounded authoritative highlight facts and final selection.

### New client modules

- `src/client/tactical-module-ui.ts`: module card view models and lobby selection markup.
- `src/client/map-event-visuals.ts`: pooled Phaser presentation and event HUD model.
- `src/client/match-highlight-ui.ts`: post-match highlight card rendering.
- `src/client/room-preset-store.ts`: local persistence, migration, and corruption recovery.

### New test support

- `tests/helpers/fault-injected-transport.ts`: seeded packet loss, jitter, reordering, and disconnect scheduler.
- `tests/tactical-modules.test.ts`
- `tests/tactical-module-room.test.ts`
- `tests/tactical-module-ui.test.ts`
- `tests/map-events.test.ts`
- `tests/map-event-system.test.ts`
- `tests/map-event-simulation.test.ts`
- `tests/map-event-visuals.test.ts`
- `tests/map-event-matrix.test.ts`
- `tests/match-highlights.test.ts`
- `tests/match-highlight-ui.test.ts`
- `tests/room-presets.test.ts`
- `tests/host-presets.test.ts`
- `tests/network-faults.test.ts`

### Existing integration points

- `src/shared/protocol.ts`: module, event, highlight, preset, and bot difficulty contracts.
- `src/shared/map-catalog.ts`: safe event points and zones per map.
- `src/server/room.ts`: seat selections, lobby commands, preset application, event option, bot difficulty.
- `src/server/simulation.ts`: module effects, map-event advancement, highlight facts, snapshots, cleanup.
- `src/server/exclusive-skill-system.ts`: category-specific cooldown-converter potency.
- `src/server/skill-system.ts`: shield and healing module hooks.
- `src/server/bot.ts`: behavior profiles and event responses.
- `src/server/network.ts`: payload guards and new commands.
- `src/server/host-admin.ts`: authorization and atomic preset validation.
- `src/client/network.ts`: module-change command.
- `src/client/mobile-app.ts`: lobby selection, event status, and results integration.
- `src/client/game-scene.ts`: pooled map-event visuals.
- `src/client/host-app.ts`: bot/event controls and preset management.
- `src/client/styles.css`: responsive module, event, highlight, and preset layouts.
- `scripts/map-visual-smoke.mjs`: map-event screenshot states.
- `scripts/v4-load-test.ts`: six-player event/module pressure coverage.
- `package.json`: targeted network-fault command.

## Phase A: Tactical Modules

### Task 1: Define Tactical Module Contracts

**Files:**
- Create: `src/shared/tactical-module-catalog.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/tactical-modules.test.ts`

- [ ] **Step 1: Write the failing catalog tests**

```ts
import { describe, expect, it } from "vitest";
import {
  TACTICAL_MODULES,
  defaultTacticalModuleForCharacter,
  isTacticalModuleId,
} from "../src/shared/tactical-module-catalog";

describe("tactical module catalog", () => {
  it("defines four modules with a benefit, tradeoff, and counterplay", () => {
    expect(TACTICAL_MODULES).toHaveLength(4);
    for (const module of TACTICAL_MODULES) {
      expect(module.benefit.length).toBeGreaterThan(4);
      expect(module.tradeoff.length).toBeGreaterThan(4);
      expect(module.counterplay.length).toBeGreaterThan(4);
      expect(isTacticalModuleId(module.id)).toBe(true);
    }
  });

  it("assigns a valid deterministic default to every character", () => {
    for (const id of ["blaze", "medic", "fortress", "arc", "phase", "runner"] as const) {
      expect(isTacticalModuleId(defaultTacticalModuleForCharacter(id))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- --run tests/tactical-modules.test.ts`

Expected: FAIL because `src/shared/tactical-module-catalog.ts` does not exist.

- [ ] **Step 3: Add the catalog and protocol fields**

```ts
export type TacticalModuleId =
  | "shield-reinforcement"
  | "ballistic-acceleration"
  | "healing-amplifier"
  | "cooldown-converter";

export interface TacticalModuleDefinition {
  id: TacticalModuleId;
  name: string;
  summary: string;
  benefit: string;
  tradeoff: string;
  counterplay: string;
}

export const TACTICAL_MODULES: readonly TacticalModuleDefinition[] = [
  { id: "shield-reinforcement", name: "护盾强化", summary: "更强护盾换取持盾机动性", benefit: "技能护盾容量提高 30%", tradeoff: "持盾时移动速度降低 7%", counterplay: "持续集火或绕后，利用其持盾减速" },
  { id: "ballistic-acceleration", name: "弹道加速", summary: "更快弹道换取射程与命中宽容", benefit: "普通子弹速度提高 18%", tradeoff: "最大射程降低 12%，碰撞半径降低 10%", counterplay: "远距离拉扯并保持横向移动" },
  { id: "healing-amplifier", name: "治疗增幅", summary: "强化团队治疗但延后自然恢复", benefit: "主动治疗提高 22%，外部治疗提高 10%", tradeoff: "脱战回血延后 750ms", counterplay: "持续施压并优先逼退治疗来源" },
  { id: "cooldown-converter", name: "冷却转换", summary: "更频繁但更弱的专属技能", benefit: "专属技能冷却缩短 15%", tradeoff: "技能有效维度降低 12%", counterplay: "识别短效果，在结束后集中进攻" },
] as const;
```

Add `tacticalModuleId` to `JoinPayload`, room players, and `PlayerSnapshot`; add `changeTacticalModule` to `ClientToServerEvents`.

- [ ] **Step 4: Run targeted tests and typecheck**

Run: `npm test -- --run tests/tactical-modules.test.ts && npm run typecheck`

Expected: PASS with four catalog entries and no protocol type errors.

- [ ] **Step 5: Commit the contract**

```bash
git add src/shared/tactical-module-catalog.ts src/shared/protocol.ts tests/tactical-modules.test.ts
git commit -m "feat: define tactical module contracts"
```

### Task 2: Store and Validate Lobby Module Selection

**Files:**
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Modify: `src/client/network.ts`
- Test: `tests/tactical-module-room.test.ts`
- Test: `tests/network.test.ts`

- [ ] **Step 1: Write failing room tests**

```ts
it("changes a valid module before ready and rejects changes after ready", () => {
  const room = new GameRoom();
  const joined = room.joinHuman("socket", { nickname: "测试", characterId: "blaze", tacticalModuleId: "shield-reinforcement" });
  expect(joined.ok).toBe(true);
  expect(room.changeTacticalModule("socket", "ballistic-acceleration")).toEqual({ ok: true });
  expect(room.setReady("socket", true)).toEqual({ ok: true });
  expect(room.changeTacticalModule("socket", "cooldown-converter")).toMatchObject({ ok: false });
  expect(room.snapshot().players[0]!.tacticalModuleId).toBe("ballistic-acceleration");
});

it("restores the same module after disconnect and reconnect", () => {
  const room = new GameRoom();
  const joined = room.joinHuman("socket-a", { nickname: "测试", characterId: "phase", tacticalModuleId: "cooldown-converter" });
  room.disconnect("socket-a");
  expect(room.reconnectHuman("socket-b", joined.data!.reconnectToken).ok).toBe(true);
  expect(room.snapshot().players[0]!.tacticalModuleId).toBe("cooldown-converter");
});
```

- [ ] **Step 2: Verify selection tests fail**

Run: `npm test -- --run tests/tactical-module-room.test.ts tests/network.test.ts`

Expected: FAIL because seats and network guards do not support tactical modules.

- [ ] **Step 3: Implement seat storage and guarded network command**

Add `tacticalModuleId` to `RoomSeat` and `PlayerSeed`, default invalid or omitted join values through `defaultTacticalModuleForCharacter`, and implement:

```ts
changeTacticalModule(socketId: string, tacticalModuleId: TacticalModuleId): Ack {
  if (this.world) return { ok: false, error: "对局开始后无法更换战术模组" };
  const seat = this.seatForSocket(socketId);
  if (!seat?.connected || seat.isBot) return { ok: false, error: "尚未加入房间" };
  if (seat.ready) return { ok: false, error: "请先取消准备再更换战术模组" };
  if (!isTacticalModuleId(tacticalModuleId)) return { ok: false, error: "战术模组无效" };
  seat.tacticalModuleId = tacticalModuleId;
  return { ok: true };
}
```

Register the Socket.IO event, validate it with `isTacticalModuleId`, broadcast the room on success, and expose `GameNetworkClient.changeTacticalModule`.

- [ ] **Step 4: Run room and network tests**

Run: `npm test -- --run tests/tactical-module-room.test.ts tests/network.test.ts tests/room.test.ts`

Expected: PASS; existing character and readiness rules remain unchanged.

- [ ] **Step 5: Commit lobby selection support**

```bash
git add src/server/room.ts src/server/network.ts src/client/network.ts tests/tactical-module-room.test.ts tests/network.test.ts
git commit -m "feat: persist lobby tactical module selection"
```

### Task 3: Apply Balanced Runtime Module Effects

**Files:**
- Create: `src/server/tactical-modules.ts`
- Modify: `src/server/simulation.ts`
- Modify: `src/server/skill-system.ts`
- Modify: `src/server/exclusive-skill-system.ts`
- Test: `tests/tactical-modules.test.ts`
- Test: `tests/simulation.test.ts`
- Test: `tests/exclusive-skill-system.test.ts`

- [ ] **Step 1: Add failing modifier tests for all six characters**

```ts
it.each(CHARACTER_CATALOG)("keeps %s module tradeoffs bounded", (character) => {
  const ballistic = resolveTacticalRuntime(character, {}, "ballistic-acceleration");
  expect(ballistic.projectileSpeed).toBeCloseTo(character.projectileSpeed * 1.18);
  expect(ballistic.projectileMaxDistance).toBeCloseTo(PROJECTILE_MAX_DISTANCE * 0.88);
  expect(ballistic.projectileRadius).toBeCloseTo(PROJECTILE_RADIUS * 0.9);
  expect(ballistic.damage).toBe(character.damage);

  const cooldown = resolveTacticalRuntime(character, {}, "cooldown-converter");
  expect(cooldown.exclusiveSkillCooldownMs).toBe(DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS * 0.85);
  expect(cooldown.exclusivePotencyMultiplier).toBe(0.88);
});
```

Also add focused tests for shield capacity and movement tradeoff, self/team healing multipliers, regen delay, projectile distance, and host override ordering.

- [ ] **Step 2: Verify runtime tests fail**

Run: `npm test -- --run tests/tactical-modules.test.ts tests/simulation.test.ts tests/exclusive-skill-system.test.ts`

Expected: FAIL because `resolveTacticalRuntime` and potency hooks do not exist.

- [ ] **Step 3: Implement pure runtime resolution**

```ts
export interface TacticalRuntimeModifiers {
  projectileSpeedMultiplier: number;
  projectileDistanceMultiplier: number;
  projectileRadiusMultiplier: number;
  shieldMultiplier: number;
  shieldMoveMultiplier: number;
  activeHealingMultiplier: number;
  selfHealingMultiplier: number;
  receivedHealingMultiplier: number;
  regenDelayAddMs: number;
  exclusiveCooldownMultiplier: number;
  exclusivePotencyMultiplier: number;
}

export function tacticalRuntimeModifiers(id: TacticalModuleId): TacticalRuntimeModifiers {
  const neutral = { projectileSpeedMultiplier: 1, projectileDistanceMultiplier: 1, projectileRadiusMultiplier: 1, shieldMultiplier: 1, shieldMoveMultiplier: 1, activeHealingMultiplier: 1, selfHealingMultiplier: 1, receivedHealingMultiplier: 1, regenDelayAddMs: 0, exclusiveCooldownMultiplier: 1, exclusivePotencyMultiplier: 1 };
  if (id === "shield-reinforcement") return { ...neutral, shieldMultiplier: 1.3, shieldMoveMultiplier: 0.93 };
  if (id === "ballistic-acceleration") return { ...neutral, projectileSpeedMultiplier: 1.18, projectileDistanceMultiplier: 0.88, projectileRadiusMultiplier: 0.9 };
  if (id === "healing-amplifier") return { ...neutral, activeHealingMultiplier: 1.22, selfHealingMultiplier: 1.1, receivedHealingMultiplier: 1.1, regenDelayAddMs: 750 };
  return { ...neutral, exclusiveCooldownMultiplier: 0.85, exclusivePotencyMultiplier: 0.88 };
}
```

Store resolved distance, radius, healing, regen, and potency fields on `WorldPlayer`; use them at projectile creation, shield creation, healing, movement, regen, and exclusive-skill effect sites. Preserve safe numeric clamps after modifiers.

- [ ] **Step 4: Run module, simulation, skill, and admin regressions**

Run: `npm test -- --run tests/tactical-modules.test.ts tests/simulation.test.ts tests/skill-system.test.ts tests/exclusive-skill-system.test.ts tests/host-admin.test.ts tests/room.test.ts`

Expected: PASS with no base damage, score, or max-health increase from modules.

- [ ] **Step 5: Commit runtime module effects**

```bash
git add src/server/tactical-modules.ts src/server/simulation.ts src/server/skill-system.ts src/server/exclusive-skill-system.ts tests/tactical-modules.test.ts tests/simulation.test.ts tests/exclusive-skill-system.test.ts
git commit -m "feat: apply tactical module tradeoffs"
```

### Task 4: Add Responsive Tactical Module Selection UI

**Files:**
- Create: `src/client/tactical-module-ui.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/tactical-module-ui.test.ts`
- Test: `tests/character-selection-ui.test.ts`

- [ ] **Step 1: Write failing UI view-model tests**

```ts
it("renders benefit, tradeoff, and counterplay for every module", () => {
  const html = renderTacticalModuleCards("shield-reinforcement", false);
  expect(html).toContain("收益");
  expect(html).toContain("代价");
  expect(html).toContain("反制");
  expect((html.match(/data-tactical-module-id=/g) ?? [])).toHaveLength(4);
});

it("locks module buttons after the player is ready", () => {
  expect(renderTacticalModuleCards("healing-amplifier", true)).toContain("disabled");
});
```

- [ ] **Step 2: Verify UI tests fail**

Run: `npm test -- --run tests/tactical-module-ui.test.ts tests/character-selection-ui.test.ts`

Expected: FAIL because the module UI renderer does not exist.

- [ ] **Step 3: Render and wire module cards**

Create a pure escaped markup function using `TACTICAL_MODULES`. Add one delegated click handler in `MobileApp`, call `network.changeTacticalModule`, and render the selected module below character traits. Use a single horizontal scroll row below 900px landscape width and fixed card min/max dimensions so selection does not resize the lobby.

- [ ] **Step 4: Run UI tests and production build**

Run: `npm test -- --run tests/tactical-module-ui.test.ts tests/character-selection-ui.test.ts tests/mobile-viewport.test.ts && npm run build`

Expected: PASS; Vite emits the mobile bundle without overflow warnings.

- [ ] **Step 5: Commit module UI**

```bash
git add src/client/tactical-module-ui.ts src/client/mobile-app.ts src/client/styles.css tests/tactical-module-ui.test.ts tests/character-selection-ui.test.ts
git commit -m "feat: add pre-match tactical module UI"
```

## Phase B: Temporary Map Events

### Task 5: Define Event Catalog and Safe Map Geometry

**Files:**
- Create: `src/shared/map-events.ts`
- Modify: `src/shared/map-catalog.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/map-events.test.ts`
- Test: `tests/map-catalog.test.ts`

- [ ] **Step 1: Write failing catalog and geometry tests**

```ts
it.each(MAP_CATALOG)("keeps %s event geometry outside walls and spawn safety radii", (map) => {
  expect(map.eventSupplyPoints.length).toBeGreaterThanOrEqual(3);
  expect(map.eventLockdownZones.length).toBeGreaterThanOrEqual(2);
  expect(map.eventStormSafeZones.length).toBeGreaterThanOrEqual(2);
  for (const point of map.eventSupplyPoints) {
    expect(map.walls.some((wall) => circleHitsRect(point.x, point.y, 24, wall))).toBe(false);
    expect(map.spawnPoints.every((spawn) => distanceSquared(point, spawn) >= 170 ** 2)).toBe(true);
  }
});
```

Test that all four definitions contain timing and counterplay text, and that event snapshots use a bounded participant list.

- [ ] **Step 2: Verify catalog tests fail**

Run: `npm test -- --run tests/map-events.test.ts tests/map-catalog.test.ts`

Expected: FAIL because map event geometry and types are absent.

- [ ] **Step 3: Add definitions and hand-verified safe geometry**

Define `MapEventKind`, `MapEventPhase`, `MapEventZone`, `MapEventSnapshot`, and four immutable definitions. Add explicit event nodes to each existing map rather than deriving them from arbitrary empty space. Reuse `zoneContainsPoint` and `zoneBounds` where their semantics match.

- [ ] **Step 4: Run geometry tests**

Run: `npm test -- --run tests/map-events.test.ts tests/map-catalog.test.ts tests/collision.test.ts`

Expected: PASS with zero wall/spawn overlap failures.

- [ ] **Step 5: Commit event contracts and geometry**

```bash
git add src/shared/map-events.ts src/shared/map-catalog.ts src/shared/protocol.ts tests/map-events.test.ts tests/map-catalog.test.ts
git commit -m "feat: define temporary map event geometry"
```

### Task 6: Implement the Deterministic Event State Machine

**Files:**
- Create: `src/server/map-event-system.ts`
- Test: `tests/map-event-system.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

```ts
it("advances warning, active, cooldown, and the next deterministic event", () => {
  const state = createMapEventState("reactor-core", 0, true, 1234);
  advanceMapEventState(state!, 45_000, { mapMechanicBusy: false, allowNewEvent: true });
  expect(state!.phase).toBe("warning");
  const firstKind = state!.kind;
  advanceMapEventState(state!, state!.phaseEndsAt, { mapMechanicBusy: false, allowNewEvent: true });
  expect(state!.phase).toBe("active");
  advanceMapEventState(state!, state!.phaseEndsAt + 60_000, { mapMechanicBusy: false, allowNewEvent: true });
  expect(state!.kind).not.toBe(firstKind);
});

it("defers a warning until three seconds after a busy map mechanic", () => {
  const state = createMapEventState("neon-docks", 0, true, 7)!;
  advanceMapEventState(state, 45_000, { mapMechanicBusy: true, allowNewEvent: true });
  expect(state.phase).toBe("idle");
  expect(state.phaseEndsAt).toBe(48_000);
});
```

Add tests for large deltas, disabled state, supply capture reset, lockdown grace, scan pulse visibility, storm safe-zone checks, and reset cleanup.

- [ ] **Step 2: Verify state-machine tests fail**

Run: `npm test -- --run tests/map-event-system.test.ts`

Expected: FAIL because the state machine is missing.

- [ ] **Step 3: Implement bounded deterministic state**

Use a fixed four-kind rotation seeded by match/map identity, `MAX_TRANSITIONS_PER_ADVANCE = 1_024`, a single active zone, bounded sets/maps for current participants, and explicit `clearEventRoundState`. Keep collision ownership outside this module; it only reports zone membership and timed effects.

- [ ] **Step 4: Run state-machine tests**

Run: `npm test -- --run tests/map-event-system.test.ts`

Expected: PASS with exact phase timestamps and no duplicate consecutive kind.

- [ ] **Step 5: Commit the state machine**

```bash
git add src/server/map-event-system.ts tests/map-event-system.test.ts
git commit -m "feat: add authoritative map event state machine"
```

### Task 7: Integrate Event Rules, Room Toggle, and Bots

**Files:**
- Modify: `src/server/simulation.ts`
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Modify: `src/server/host-admin.ts`
- Modify: `src/server/bot.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/map-event-simulation.test.ts`
- Test: `tests/bot.test.ts`
- Test: `tests/room.test.ts`

- [ ] **Step 1: Write failing authoritative integration tests**

Test exact behaviors: supply requires one uninterrupted second and heals 25; lockdown grants two-second grace then slows/damages without creating walls; scan marks only players active in the last 700ms; storm preserves one health and awards no kill; forced finish and reset clear all event state; bots leave storm/lockdown and contest safe supply only when appropriate.

```ts
expect(world.mapWalls.query(zoneBounds(lockdownZone))).toEqual(originalWallQuery);
expect(stormVictim.health).toBe(1);
expect(stormVictim.deaths).toBe(0);
expect(world.killFeed).toHaveLength(0);
```

- [ ] **Step 2: Verify integration tests fail**

Run: `npm test -- --run tests/map-event-simulation.test.ts tests/bot.test.ts tests/room.test.ts`

Expected: FAIL because `GameWorld`, room options, and bots do not process temporary events.

- [ ] **Step 3: Wire event state into simulation and room commands**

Add `mapEventsEnabled` and `mapEventState` to `GameWorld`; create state in `createGameWorld`; advance and apply effects from a focused `updateMapEvents(world, deltaMs)` helper; emit one `mapEvent` snapshot. Add `{ type: "setMapEvents"; enabled: boolean }` to host admin commands and lobby snapshot. Extend bot objectives with event escape, safe-zone, supply-contest, and scan-idle priorities without changing bot health or damage.

- [ ] **Step 4: Run rule, room, bot, collision, and force-winner tests**

Run: `npm test -- --run tests/map-event-simulation.test.ts tests/bot.test.ts tests/room.test.ts tests/host-admin.test.ts tests/collision.test.ts tests/match-results.test.ts`

Expected: PASS; zero new wall objects and zero environment kills.

- [ ] **Step 5: Commit authoritative event integration**

```bash
git add src/server/simulation.ts src/server/room.ts src/server/network.ts src/server/host-admin.ts src/server/bot.ts src/shared/protocol.ts tests/map-event-simulation.test.ts tests/bot.test.ts tests/room.test.ts
git commit -m "feat: integrate temporary map events"
```

### Task 8: Add Pooled Event Presentation and Lobby Explanations

**Files:**
- Create: `src/client/map-event-visuals.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/host-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/map-event-visuals.test.ts`
- Test: `tests/map-mechanic-visuals.test.ts`

- [ ] **Step 1: Write failing visual-model tests**

```ts
it("uses distinct warning shapes and readable labels", () => {
  expect(mapEventVisualModel(event("supply-drop")).shape).toBe("beacon");
  expect(mapEventVisualModel(event("area-lockdown")).shape).toBe("barrier-field");
  expect(mapEventVisualModel(event("global-scan")).shape).toBe("scan-ring");
  expect(mapEventVisualModel(event("energy-storm")).shape).toBe("storm-boundary");
  expect(mapEventVisualModel(event("global-scan")).label).toContain("静止");
});

it("caps every pooled effect collection", () => {
  const layer = createMapEventVisualState();
  for (let index = 0; index < 500; index += 1) syncMapEventVisualState(layer, event("global-scan", index));
  expect(layer.particles.length).toBeLessThanOrEqual(MAX_MAP_EVENT_PARTICLES);
});
```

- [ ] **Step 2: Verify visual tests fail**

Run: `npm test -- --run tests/map-event-visuals.test.ts tests/map-mechanic-visuals.test.ts`

Expected: FAIL because event visual models do not exist.

- [ ] **Step 3: Implement pooled Phaser visuals and UI**

Create one reusable graphics layer, bounded particles, one HUD line, and one audio cue per phase transition. Render thick readable boundaries without covering characters, aim lines, or skill indicators. Add host/mobile lobby event description and toggle. Do not add quality tiers, DPR caps, particle reduction, or alternate low-detail branches.

- [ ] **Step 4: Run visuals, UI, and build tests**

Run: `npm test -- --run tests/map-event-visuals.test.ts tests/map-mechanic-visuals.test.ts tests/host-layout.test.ts tests/mobile-viewport.test.ts && npm run build`

Expected: PASS with fixed pool limits and no DOM overflow assertion failures.

- [ ] **Step 5: Commit event presentation**

```bash
git add src/client/map-event-visuals.ts src/client/game-scene.ts src/client/mobile-app.ts src/client/host-app.ts src/client/styles.css tests/map-event-visuals.test.ts tests/map-mechanic-visuals.test.ts
git commit -m "feat: present temporary map events"
```

## Phase C: Post-Match Highlights

### Task 9: Track and Select Authoritative Highlights

**Files:**
- Create: `src/shared/match-highlights.ts`
- Create: `src/server/match-highlight-tracker.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/simulation.ts`
- Test: `tests/match-highlights.test.ts`
- Test: `tests/match-results.test.ts`

- [ ] **Step 1: Write failing threshold and ordering tests**

```ts
it("selects at most one of each kind and four total", () => {
  const tracker = createMatchHighlightTracker();
  recordFiveKillStreak(tracker, "player-1", 1000, 6);
  recordFiveKillStreak(tracker, "player-2", 1200, 5);
  recordHazardEscape(tracker, "player-2", 900, "reactor-vent");
  expect(finalizeMatchHighlights(tracker, worldSnapshot()).map((item) => item.kind)).toEqual([
    "five-kill-streak",
    "hazard-escape",
  ]);
});

it("confirms critical healing only when the target survives four seconds", () => {
  const tracker = createMatchHighlightTracker();
  recordHealingCandidate(tracker, { healerId: "medic", targetId: "ally", beforeHealthRatio: 0.2, amount: 20, at: 1000 });
  advanceHighlightTracker(tracker, 4999, alivePlayers("ally"));
  expect(finalizeMatchHighlights(tracker, worldSnapshot())).toHaveLength(0);
  advanceHighlightTracker(tracker, 5000, alivePlayers("ally"));
  expect(finalizeMatchHighlights(tracker, worldSnapshot())[0]!.kind).toBe("critical-healing");
});
```

Add capture-deficit, final-win, hazard timing, tie ordering, empty result, and MVP-independence tests.

- [ ] **Step 2: Verify highlight tests fail**

Run: `npm test -- --run tests/match-highlights.test.ts tests/match-results.test.ts`

Expected: FAIL because highlight types and tracker are missing.

- [ ] **Step 3: Implement bounded facts and final selection**

Store only best candidate per kind plus pending critical-heal candidates with a six-player bound. Record facts at existing kill, healing, capture-score, and reactor-escape points. Finalize once in `finishMatch`, attach `matchHighlights` to finished snapshots, and keep `selectMatchMvp` unchanged.

- [ ] **Step 4: Run highlight and result tests**

Run: `npm test -- --run tests/match-highlights.test.ts tests/match-results.test.ts tests/simulation.test.ts tests/map-mechanics.test.ts`

Expected: PASS; MVP scores remain byte-for-byte equal for fixtures without new contributions.

- [ ] **Step 5: Commit highlight tracking**

```bash
git add src/shared/match-highlights.ts src/server/match-highlight-tracker.ts src/shared/protocol.ts src/server/simulation.ts tests/match-highlights.test.ts tests/match-results.test.ts
git commit -m "feat: track authoritative match highlights"
```

### Task 10: Render Compact Post-Match Highlight Cards

**Files:**
- Create: `src/client/match-highlight-ui.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/match-highlight-ui.test.ts`

- [ ] **Step 1: Write failing result-markup tests**

```ts
it("escapes player names and renders the authoritative fact value", () => {
  const html = renderMatchHighlights([{ kind: "five-kill-streak", playerId: "p", playerName: "<测试>", value: 6, occurredAt: 1000 }]);
  expect(html).toContain("&lt;测试&gt;");
  expect(html).toContain("六连杀");
  expect(html).not.toContain("<测试>");
});

it("renders no empty highlight container", () => {
  expect(renderMatchHighlights([])).toBe("");
});
```

- [ ] **Step 2: Verify markup tests fail**

Run: `npm test -- --run tests/match-highlight-ui.test.ts`

Expected: FAIL because the renderer is missing.

- [ ] **Step 3: Add cards below the existing results table**

Render at most four cards using existing character portraits, a short fact line, and no nested cards. Preserve exit/restart buttons and viewport scrolling. Clear old cards when a new match starts; retain the finished snapshot while back in the results view.

- [ ] **Step 4: Run result and viewport tests**

Run: `npm test -- --run tests/match-highlight-ui.test.ts tests/match-results.test.ts tests/mobile-viewport.test.ts && npm run build`

Expected: PASS with no results overlay clipping at iPhone landscape sizes.

- [ ] **Step 5: Commit post-match highlights UI**

```bash
git add src/client/match-highlight-ui.ts src/client/mobile-app.ts src/client/styles.css tests/match-highlight-ui.test.ts
git commit -m "feat: show post-match highlights"
```

## Phase D: Room Presets and Bot Difficulty

### Task 11: Add Bot Behavior Profiles and Atomic Preset Validation

**Files:**
- Create: `src/shared/bot-difficulty.ts`
- Create: `src/shared/room-presets.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/bot.ts`
- Modify: `src/server/room.ts`
- Modify: `src/server/host-admin.ts`
- Modify: `src/server/network.ts`
- Test: `tests/room-presets.test.ts`
- Test: `tests/bot.test.ts`
- Test: `tests/host-admin.test.ts`

- [ ] **Step 1: Write failing behavior and atomicity tests**

```ts
it("changes bot behavior without changing character stats", () => {
  const easy = chooseBotDecision(world, "bot-1", () => 0.5, "easy");
  const hard = chooseBotDecision(world, "bot-1", () => 0.5, "hard");
  expect(easy.aimErrorRadians).toBeGreaterThan(hard.aimErrorRadians);
  expect(world.players.get("bot-1")!.damage).toBe(getCharacter("medic").damage);
  expect(world.players.get("bot-1")!.maxHealth).toBe(getCharacter("medic").maxHealth);
});

it("rejects an invalid preset without changing any room setting", () => {
  const before = structuredClone(room.snapshot());
  const result = room.applyHostAdminCommand({ type: "applyRoomPreset", preset: invalidPresetWithDamage(999999) });
  expect(result.ok).toBe(false);
  expect(room.snapshot()).toEqual(before);
});
```

- [ ] **Step 2: Verify preset and difficulty tests fail**

Run: `npm test -- --run tests/room-presets.test.ts tests/bot.test.ts tests/host-admin.test.ts`

Expected: FAIL because profiles, schema, and atomic apply are absent.

- [ ] **Step 3: Add behavior profiles and validate-before-mutate preset application**

Define `BotDifficulty = "easy" | "normal" | "hard"` with reaction, aim error, aggression, event avoidance, and ally-protection values. Add `botDifficulty` to room/world snapshots and pass it into `chooseBotDecision`. Define `RoomPresetV1`; validate every field and stat clamp into a temporary normalized object, then update room fields and character-keyed lobby overrides in one commit section. Reject preset application outside the lobby.

- [ ] **Step 4: Run preset, bot, host, and room tests**

Run: `npm test -- --run tests/room-presets.test.ts tests/bot.test.ts tests/host-admin.test.ts tests/room.test.ts tests/network.test.ts`

Expected: PASS; no bot health or damage differs solely due to difficulty.

- [ ] **Step 5: Commit server presets and bot profiles**

```bash
git add src/shared/bot-difficulty.ts src/shared/room-presets.ts src/shared/protocol.ts src/server/bot.ts src/server/room.ts src/server/host-admin.ts src/server/network.ts tests/room-presets.test.ts tests/bot.test.ts tests/host-admin.test.ts
git commit -m "feat: add atomic room presets and bot profiles"
```

### Task 12: Add Host Preset Persistence and Controls

**Files:**
- Create: `src/client/room-preset-store.ts`
- Modify: `src/client/host-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/host-presets.test.ts`
- Test: `tests/host-layout.test.ts`

- [ ] **Step 1: Write failing store and host markup tests**

```ts
it("recovers from corrupt storage and caps presets at eight", () => {
  const storage = memoryStorage({ "energy-brawl:room-presets:v1": "not-json" });
  const store = new RoomPresetStore(storage);
  expect(store.list()).toEqual([]);
  for (let index = 0; index < 10; index += 1) store.save(validPreset(`预设${index}`));
  expect(store.list()).toHaveLength(8);
});

it("never persists player ids or force-winner actions", () => {
  const json = JSON.stringify(RoomPresetStore.fromRoom(validRoomSnapshot()));
  expect(json).not.toContain("player-1");
  expect(json).not.toContain("forceWinner");
});
```

- [ ] **Step 2: Verify host preset tests fail**

Run: `npm test -- --run tests/host-presets.test.ts tests/host-layout.test.ts`

Expected: FAIL because the store and controls are absent.

- [ ] **Step 3: Implement local persistence and accessible controls**

Use the key `energy-brawl:room-presets:v1`, schema-check on read, keep the eight most recently updated entries, and remove invalid entries without throwing. Add one compact preset bar containing select, save, apply, rename, and delete commands; use icon buttons with titles where existing icons are available. Disable mutation outside the lobby. Add bot difficulty and event toggle controls to the same room-rules band.

- [ ] **Step 4: Run host UI, storage, and build tests**

Run: `npm test -- --run tests/host-presets.test.ts tests/host-layout.test.ts tests/host-state.test.ts && npm run build`

Expected: PASS; the host page remains vertically scrollable and diagnostics remain reachable.

- [ ] **Step 5: Commit host preset controls**

```bash
git add src/client/room-preset-store.ts src/client/host-app.ts src/client/styles.css tests/host-presets.test.ts tests/host-layout.test.ts
git commit -m "feat: persist host room presets"
```

## Phase E: Network Faults and Final Gates

### Task 13: Build the Seeded Network Fault Harness

**Files:**
- Create: `tests/helpers/fault-injected-transport.ts`
- Create: `tests/network-faults.test.ts`
- Modify: `src/server/room.ts`
- Modify: `src/client/network.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing deterministic harness tests**

```ts
it("reproduces the same drop and jitter schedule with the same seed", () => {
  const first = createFaultSchedule({ seed: 42, packetLoss: 0.1, minDelayMs: 30, maxDelayMs: 180 }, 100);
  const second = createFaultSchedule({ seed: 42, packetLoss: 0.1, minDelayMs: 30, maxDelayMs: 180 }, 100);
  expect(first).toEqual(second);
  expect(first.some((entry) => entry.dropped)).toBe(true);
  expect(first.some((entry, index) => index > 0 && entry.deliverAt < first[index - 1]!.deliverAt)).toBe(true);
});
```

Add an integration fixture that joins a real in-process Socket.IO server, applies faults only to player input/skill actions, disconnects for three seconds, and reconnects with the original token.

- [ ] **Step 2: Verify harness tests fail**

Run: `npm test -- --run tests/network-faults.test.ts`

Expected: FAIL because the fault scheduler does not exist.

- [ ] **Step 3: Implement seeded delivery and explicit convergence assertions**

Use a local xorshift32 generator, bounded scheduled packet array, fake timers, and monotonic local action sequences. On reconnect, clear pending input, ordinary skill, and exclusive-skill actions in `GameRoom`; reset local client action sequencing only after accepting the authoritative snapshot. Add `test:network-faults` as `vitest --run tests/network-faults.test.ts`.

- [ ] **Step 4: Run fault and reconnect tests**

Run: `npm run test:network-faults && npm test -- --run tests/network.test.ts tests/diagnostics-network-client.test.ts tests/presentation-events.test.ts`

Expected: PASS; all clients converge within the defined snapshot window and no cast event is duplicated.

- [ ] **Step 5: Commit network fault automation**

```bash
git add tests/helpers/fault-injected-transport.ts tests/network-faults.test.ts src/server/room.ts src/client/network.ts package.json
git commit -m "test: add deterministic network fault matrix"
```

### Task 14: Add the Combined Map/Mode Pressure Matrix

**Files:**
- Create: `tests/map-event-matrix.test.ts`
- Modify: `scripts/v4-load-test.ts`
- Test: `tests/map-event-matrix.test.ts`

- [ ] **Step 1: Write the failing 30-combination matrix test**

```ts
for (const mapId of MAP_IDS) {
  for (const mode of MATCH_MODES) {
    for (const mapEventsEnabled of [false, true]) {
      it(`${mapId} ${mode} events=${mapEventsEnabled}`, () => {
        const result = runSixPlayerScenario({ mapId, mode, mapEventsEnabled, durationMs: mapEventsEnabled ? 130_000 : 30_000 });
        expect(result.wallViolations).toBe(0);
        expect(result.stuckCorrections).toBe(0);
        expect(result.friendlyFireIncidents).toBe(0);
        expect(result.expiredStateResidue).toBe(0);
        expect(result.eventCount).toBe(mapEventsEnabled ? expect.any(Number) : 0);
      });
    }
  }
}
```

- [ ] **Step 2: Verify matrix instrumentation fails**

Run: `npm test -- --run tests/map-event-matrix.test.ts`

Expected: FAIL because load-test result fields and event options are missing.

- [ ] **Step 3: Extend existing deterministic load-test instrumentation**

Count event rounds, wall violations, repeated position corrections, friendly-fire damage, expired module/event states, peak projectiles, peak presentation events, snapshot JSON bytes, and simulation-step timing. Do not change server tick, snapshot rate, render resolution, or effect capacity to obtain passing numbers.

- [ ] **Step 4: Run matrix and six-player load tests**

Run: `npm test -- --run tests/map-event-matrix.test.ts && npm run load-test:v4`

Expected: PASS with zero wall/stuck/friendly-fire/residue failures and bounded snapshot/event counts.

- [ ] **Step 5: Commit pressure coverage**

```bash
git add tests/map-event-matrix.test.ts scripts/v4-load-test.ts
git commit -m "test: cover map events across all modes"
```

### Task 15: Perform Full Regression, Visual QA, and Documentation

**Files:**
- Modify: `scripts/map-visual-smoke.mjs`
- Modify: `README.md`
- Test: all test and smoke suites

- [ ] **Step 1: Add smoke assertions before changing documentation**

Extend `scripts/map-visual-smoke.mjs` to capture lobby module selection, each event phase used across the three maps, finished-match highlights, and the host preset bar at desktop, iPhone landscape, and iPad landscape viewports. Assert nonblank canvas pixels, no horizontal overflow, visible event boundary, visible module selection, and no overlap with aim/skill controls.

- [ ] **Step 2: Run targeted browser smoke and inspect every screenshot**

Run: `npm run smoke:maps`

Expected: PASS and write the configured desktop/iPhone/iPad screenshots. Manually inspect every image for readable sprites, full-resolution effects, unclipped controls, non-overlapping HUD, and correct map/event identity.

- [ ] **Step 3: Run the complete automated gate**

Run: `npm test -- --run && npm run typecheck && npm run build && npm run assets:v3 && npm run assets:v4 && npm run assets:presentation && npm run smoke:clean-clone && npm run load-test:v4 && npm run test:network-faults`

Expected: all Vitest files pass; typecheck/build/assets/clean-clone/load/fault commands exit 0; clean clone reports version `4.6.0` until a later release task explicitly changes it.

- [ ] **Step 4: Update README without publishing a version**

Add an “Unreleased” section describing module tradeoffs, event counterplay, highlights, host presets, bot difficulty, network-fault coverage, and the guarantee that full DPR, effects, audio, haptics, 60Hz simulation, and 30Hz standard snapshots remain enabled. Do not change `package.json` version, create a tag, push, or publish a GitHub release.

- [ ] **Step 5: Re-run documentation and clean-tree checks**

Run: `git diff --check && npm test -- --run tests/asset-registry.test.ts tests/map-visual-smoke-script.test.ts tests/clean-clone-smoke.test.ts`

Expected: PASS with no whitespace errors, absolute development paths, or missing asset references.

- [ ] **Step 6: Commit final QA and documentation**

```bash
git add scripts/map-visual-smoke.mjs README.md tests/map-visual-smoke-script.test.ts
git commit -m "docs: record tactical systems and quality gates"
```

## Execution Rules

- Use test-driven development for every task: failing test, minimal implementation, passing targeted suite, then commit.
- Do not modify or discard the unrelated C-drive checkout changes.
- Do not create a new release, bump version, tag, push, or merge without an explicit user request.
- Do not add quality tiers, DPR caps, particle reductions, effect suppression, lower tick rates, or lower standard snapshot rates.
- Stop on unexpected pre-existing failures, overlapping user changes in the D-drive worktree, or a test that disproves the design assumption; diagnose before proceeding.
