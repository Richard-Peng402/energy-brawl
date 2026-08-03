# Energy Brawl v2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v2.0 with a larger camera-follow arena, floating dual sticks, reliable aiming feedback and collision, slower hold-to-win rules, and smooth six-client LAN play.

**Architecture:** Keep the Node.js server authoritative. Move reusable collision and interpolation math into focused shared/client modules, drive simulation with a fixed 60 Hz accumulator, and send disposable per-client snapshots at 30 or 20 Hz. Phaser renders a fixed-size camera viewport over the larger world while DOM overlays own HUD, touch zones, and results.

**Tech Stack:** TypeScript, Node.js, Express, Socket.IO, Phaser 3, Vite, Vitest

---

## File Map

- Create `src/shared/collision.ts`: continuous segment/AABB collision, circle sweep, depenetration, and safe circle motion.
- Create `src/shared/spatial-index.ts`: immutable grid index for static walls.
- Create `src/server/fixed-loop.ts`: fixed-step accumulator with bounded catch-up and timing samples.
- Create `src/server/performance.ts`: rolling percentile metrics and server diagnostics snapshots.
- Create `src/client/snapshot-buffer.ts`: time-based remote interpolation.
- Create `src/client/input-reconciliation.ts`: pending local input replay and correction tracking.
- Create `src/client/aim-guide.ts`: pure attack-corridor endpoint calculation.
- Create `scripts/load-test.ts`: six concurrent Socket.IO clients that move and fire for a bounded test duration.
- Modify `src/shared/constants.ts`: v2 map, pacing, scoring, hold, network, and camera constants.
- Modify `src/shared/protocol.ts`: hold state, auto-return state, performance hints, diagnostics, and return-to-lobby event.
- Modify `src/server/simulation.ts`: safe movement, continuous projectiles, v2 scoring, hold state, and static broad phase.
- Modify `src/server/room.ts`: latest-input queue, finished-room countdown, player return request, and diagnostics access.
- Modify `src/server/network.ts`: fixed loop, volatile per-client snapshots, adaptive cadence, and performance hints.
- Modify `src/server/index.ts`: deterministic load-test token only when `NODE_ENV=test`.
- Modify `src/server/bot.ts`: normal difficulty reaction, range, aim, and target persistence.
- Modify `src/client/virtual-stick.ts`: floating-origin pointer tracking for a half-screen zone.
- Modify `src/client/game-scene.ts`: fixed viewport, camera follow, time interpolation, map rendering, and thick aim guide.
- Modify `src/client/mobile-app.ts`: touch zones, input history, performance reporting, hold HUD, and return action.
- Modify `src/client/network.ts`: new protocol methods and snapshot receipt timing.
- Modify `src/client/styles.css`: non-zooming game surface, floating stick presentation, and result countdown control.
- Modify `src/client/host-app.ts`: server performance diagnostics without changing the visual theme.
- Modify `index.html`: harden viewport scaling restrictions.
- Modify `package.json`: version 2.0.0 and load-test command.
- Update focused files under `tests/` for every behavior below.

### Task 1: Preserve the Verified v1 Baseline

**Files:**
- Verify: `src/client/game-scene.ts`
- Verify: `src/client/host-app.ts`
- Verify: `src/client/mobile-app.ts`
- Verify: `src/server/network.ts`
- Verify: `src/server/room.ts`
- Verify: `src/shared/constants.ts`
- Verify: `tests/host-state.test.ts`
- Verify: `tests/network.test.ts`
- Verify: `tests/prediction.test.ts`
- Verify: `tests/room.test.ts`
- Verify: `tests/spawn-layout.test.ts`

- [ ] **Step 1: Confirm only the known v1 hardening files are dirty**

Run: `git status --short`

Expected: the files listed above are modified or untracked; no unrelated user file is staged.

- [ ] **Step 2: Run the existing baseline verification**

Run: `npm.cmd test -- --run && npm.cmd run typecheck && npm.cmd run build`

Expected: 27 tests pass, typecheck exits 0, and Vite build exits 0.

- [ ] **Step 3: Commit only the verified baseline changes**

```powershell
git add src/client/game-scene.ts src/client/host-app.ts src/client/mobile-app.ts src/client/prediction.ts src/server/network.ts src/server/room.ts src/shared/constants.ts tests/host-state.test.ts tests/network.test.ts tests/prediction.test.ts tests/room.test.ts tests/spawn-layout.test.ts
git commit -m "fix: harden multiplayer lifecycle and prediction"
```

Expected: commit succeeds and the v2 work starts from a reproducible green baseline.

### Task 2: Lock v2 Constants, Version, and Arena Layout

**Files:**
- Modify: `package.json`
- Modify: `src/shared/constants.ts`
- Modify: `tests/spawn-layout.test.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: Write failing v2 constant and layout tests**

Add assertions that encode the approved values:

```ts
expect(ARENA_WIDTH).toBe(2_160);
expect(ARENA_HEIGHT).toBe(1_215);
expect(MATCH_DURATION_MS).toBe(480_000);
expect(TARGET_SCORE).toBe(15);
expect(HOLD_DURATION_MS).toBe(30_000);
expect(KILL_SCORE).toBe(2);
expect(HOLDER_KILL_BONUS).toBe(1);
expect(MAX_ENERGY).toBe(6);
expect(ENERGY_RESPAWN_MS).toBe(5_000);
expect(PLAYER_SPEED).toBe(265);
expect(FIRE_COOLDOWN_MS).toBe(450);
expect(PROJECTILE_SPEED).toBe(620);
expect(SERVER_TICK_RATE).toBe(60);
expect(SNAPSHOT_RATE).toBe(30);
expect(SPAWN_POINTS).toHaveLength(6);
```

Keep the existing wall/energy overlap checks and add a pairwise spawn distance assertion of at least `360` world units.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm.cmd test -- --run tests/spawn-layout.test.ts tests/simulation.test.ts`

Expected: FAIL on old arena, pacing, reward, and timing constants.

- [ ] **Step 3: Apply the v2 constants and explicit layout**

Use these gameplay constants:

```ts
export const MATCH_DURATION_MS = 480_000;
export const HOLD_DURATION_MS = 30_000;
export const LOBBY_RETURN_DELAY_MS = 8_000;
export const KILL_SCORE = 2;
export const HOLDER_KILL_BONUS = 1;
export const SERVER_TICK_RATE = 60;
export const SERVER_TICK_MS = 1_000 / SERVER_TICK_RATE;
export const SNAPSHOT_RATE = 30;
export const REDUCED_SNAPSHOT_RATE = 20;
export const ARENA_WIDTH = 2_160;
export const ARENA_HEIGHT = 1_215;
export const VIEW_WIDTH = 1_280;
export const VIEW_HEIGHT = 720;
export const PLAYER_SPEED = 265;
export const FIRE_COOLDOWN_MS = 450;
export const PROJECTILE_SPEED = 620;
export const PROJECTILE_LIFETIME_MS = 1_850;
export const ENERGY_RESPAWN_MS = 5_000;
export const MAX_ENERGY = 6;
```

Use six spread-out spawn points and a richer wall set with open escape routes:

```ts
export const SPAWN_POINTS: readonly Vec2[] = [
  { x: 260, y: 260 }, { x: 1_080, y: 210 }, { x: 1_900, y: 260 },
  { x: 260, y: 955 }, { x: 1_080, y: 1_005 }, { x: 1_900, y: 955 },
];

export const ENERGY_SPAWN_POINTS: readonly Vec2[] = [
  { x: 1_080, y: 350 }, { x: 1_080, y: 865 },
  { x: 520, y: 607 }, { x: 1_640, y: 607 },
  { x: 760, y: 300 }, { x: 1_400, y: 915 },
  { x: 760, y: 915 }, { x: 1_400, y: 300 },
  { x: 300, y: 607 }, { x: 1_860, y: 607 },
];

export const WALLS: readonly Rect[] = [
  { x: 930, y: 475, width: 300, height: 55 },
  { x: 930, y: 685, width: 300, height: 55 },
  { x: 790, y: 535, width: 55, height: 145 },
  { x: 1_315, y: 535, width: 55, height: 145 },
  { x: 390, y: 330, width: 260, height: 55 },
  { x: 390, y: 330, width: 55, height: 190 },
  { x: 1_510, y: 330, width: 260, height: 55 },
  { x: 1_715, y: 330, width: 55, height: 190 },
  { x: 390, y: 830, width: 260, height: 55 },
  { x: 390, y: 695, width: 55, height: 190 },
  { x: 1_510, y: 830, width: 260, height: 55 },
  { x: 1_715, y: 695, width: 55, height: 190 },
  { x: 720, y: 155, width: 180, height: 45 },
  { x: 1_260, y: 1_015, width: 180, height: 45 },
];
```

Set `package.json` version to `2.0.0`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run tests/spawn-layout.test.ts tests/simulation.test.ts`

Expected: all layout and constant tests pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json src/shared/constants.ts tests/spawn-layout.test.ts tests/simulation.test.ts
git commit -m "feat: define v2 arena and pacing"
```

### Task 3: Add Shared Continuous Collision and Static Broad Phase

**Files:**
- Create: `src/shared/collision.ts`
- Create: `src/shared/spatial-index.ts`
- Create: `tests/collision.test.ts`
- Create: `tests/spatial-index.test.ts`

- [ ] **Step 1: Write failing collision tests**

Cover these concrete cases:

```ts
it("finds a thin wall crossed between projectile frames", () => {
  const hit = sweepCircleRect({ x: 0, y: 50 }, { x: 200, y: 0 }, 8, { x: 90, y: 0, width: 10, height: 100 });
  expect(hit?.time).toBeCloseTo(0.41);
});

it("depenetrates a player and still lets it move away", () => {
  const result = moveCircleSafely({ x: 95, y: 50 }, { x: -20, y: 0 }, 12, [{ x: 90, y: 0, width: 20, height: 100 }], { width: 300, height: 200 });
  expect(result.x).toBeLessThanOrEqual(78);
});

it("slides along a wall when diagonal movement is blocked", () => {
  const result = moveCircleSafely({ x: 70, y: 30 }, { x: 30, y: 25 }, 10, [{ x: 90, y: 0, width: 20, height: 100 }], { width: 300, height: 200 });
  expect(result.x).toBeLessThanOrEqual(80);
  expect(result.y).toBeGreaterThan(30);
});
```

For `StaticSpatialIndex`, assert a query only returns walls overlapping the requested cells and never omits a crossing wall.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/collision.test.ts tests/spatial-index.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement segment/AABB sweep**

Define the public API exactly as follows:

```ts
export interface SweepHit { time: number; normal: Vec2 }

export function sweepCircleRect(start: Vec2, delta: Vec2, radius: number, rect: Rect): SweepHit | null;

export function firstWallHit(
  start: Vec2,
  delta: Vec2,
  radius: number,
  walls: readonly Rect[],
): (SweepHit & { wall: Rect }) | null;

export function moveCircleSafely(
  start: Vec2,
  delta: Vec2,
  radius: number,
  walls: readonly Rect[],
  bounds: { width: number; height: number },
): Vec2;
```

Implement `sweepCircleRect` with slab intersection against a rectangle expanded by `radius`. `moveCircleSafely` must first depenetrate to the nearest rectangle edge, then attempt X and Y movement independently, and finally clamp to world bounds.

- [ ] **Step 4: Implement immutable wall grid**

```ts
export class StaticSpatialIndex {
  constructor(private readonly rects: readonly Rect[], private readonly cellSize = 240) {}
  query(bounds: Rect): readonly Rect[];
}
```

Build cell memberships in the constructor, deduplicate query results with a `Set<Rect>`, and preserve the original rectangle objects.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/collision.test.ts tests/spatial-index.test.ts`

Expected: all continuous collision and index tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/collision.ts src/shared/spatial-index.ts tests/collision.test.ts tests/spatial-index.test.ts
git commit -m "feat: add continuous collision primitives"
```

### Task 4: Fix Player Trapping and Projectile Wall Tunneling

**Files:**
- Modify: `src/server/simulation.ts`
- Modify: `src/client/prediction.ts`
- Modify: `tests/simulation.test.ts`
- Modify: `tests/prediction.test.ts`

- [ ] **Step 1: Write server regression tests**

Add tests for a player already overlapping a wall, two players pushing each other at a corner, and a projectile crossing a thin wall with a player behind it. The projectile test must assert zero health loss:

```ts
expect(world.players.get("blue")?.health).toBe(MAX_HEALTH);
expect(world.projectiles.size).toBe(0);
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/simulation.test.ts tests/prediction.test.ts`

Expected: the overlap and wall-tunneling tests fail against endpoint-only collision.

- [ ] **Step 3: Replace player motion with shared safe movement**

In both server movement and client prediction, compute normalized movement delta and call:

```ts
const next = moveCircleSafely(
  player,
  { x: direction.x * PLAYER_SPEED * seconds, y: direction.y * PLAYER_SPEED * seconds },
  PLAYER_RADIUS,
  WALL_INDEX.query(movementBounds(player, delta, PLAYER_RADIUS)),
  { width: ARENA_WIDTH, height: ARENA_HEIGHT },
);
player.x = next.x;
player.y = next.y;
```

After player separation, validate each candidate with `moveCircleSafely(candidate, { x: 0, y: 0 }, ...)` before assignment.

- [ ] **Step 4: Replace projectile endpoint checks with earliest sweep hit**

For each projectile, calculate wall and player sweep times over the same delta. Resolve only the smallest non-negative time. Delete on wall hit; call `damagePlayer` once on player hit; otherwise advance to the new position.

```ts
const wallHit = firstWallHit(projectile, delta, PROJECTILE_RADIUS, nearbyWalls);
const targetHit = firstPlayerHit(world, projectile, delta);
if (wallHit && (!targetHit || wallHit.time <= targetHit.time)) {
  world.projectiles.delete(projectile.id);
} else if (targetHit) {
  damagePlayer(world, targetHit.player.id, projectile.ownerId, PROJECTILE_DAMAGE);
  world.projectiles.delete(projectile.id);
} else {
  projectile.x += delta.x;
  projectile.y += delta.y;
}
```

- [ ] **Step 5: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/simulation.test.ts tests/prediction.test.ts`

Expected: all movement, trapping, prediction, and projectile tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/server/simulation.ts src/client/prediction.ts tests/simulation.test.ts tests/prediction.test.ts
git commit -m "fix: prevent trapping and projectile tunneling"
```

### Task 5: Implement 15-Point Hold-to-Win Rules

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/simulation.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: Replace immediate-win tests with hold-state tests**

Test start, continuation, cancellation on tie, transfer on overtake, holder defeat bonus, successful 30-second hold, eight-minute unique leader, and tied overtime.

Use this snapshot contract:

```ts
interface GameSnapshot {
  holderId: string | null;
  holdRemainingMs: number | null;
  finishedAt: number | null;
}
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/simulation.test.ts`

Expected: FAIL because reaching 15 still finishes immediately and hold fields do not exist.

- [ ] **Step 3: Add hold state to `GameWorld` and snapshots**

Initialize `holderId`, `holdRemainingMs`, and `finishedAt` to `null`. Add `refreshHolder(world)` after every score change. A unique leader with at least 15 points starts at `HOLD_DURATION_MS`; a tie clears both fields; a different unique leader starts a fresh hold.

- [ ] **Step 4: Advance and finish the hold**

During playing or overtime, subtract the fixed simulation delta only while the current holder remains the unique leader. Finish when remaining time reaches zero. At normal-time expiry, finish a unique leader or enter overtime for tied leaders.

- [ ] **Step 5: Apply reward rebalance**

Award `KILL_SCORE` for an ordinary defeat and add `HOLDER_KILL_BONUS` when the victim is the active holder. Keep energy at one point and use the new six-energy, five-second replenishment constants.

- [ ] **Step 6: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/simulation.test.ts`

Expected: all hold, reward, timeout, and overtime tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/shared/protocol.ts src/server/simulation.ts tests/simulation.test.ts
git commit -m "feat: add hold-to-win scoring"
```

### Task 6: Return Finished Matches to the Lobby

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Modify: `tests/room.test.ts`
- Modify: `tests/network.test.ts`

- [ ] **Step 1: Write failing room and network tests**

Assert that a finished room resets after `LOBBY_RETURN_DELAY_MS`, a joined player can request early return only after finish, a spectator cannot reset the room, and connected humans remain seated but unready.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/room.test.ts tests/network.test.ts`

Expected: FAIL because `returnToLobby` is not in the protocol and finished rooms do not auto-reset.

- [ ] **Step 3: Add the reliable return event**

```ts
interface ClientToServerEvents {
  returnToLobby: (acknowledge: (result: Ack) => void) => void;
}
```

Add `GameRoom.returnToLobby(socketId)` that requires an owned connected seat and `world.phase === "finished"`, then calls `resetToLobby()`.

- [ ] **Step 4: Add automatic reset timing**

When the world first enters finished phase, store `autoResetAt = clockMs + LOBBY_RETURN_DELAY_MS`. In `tick`, reset when the deadline is reached. Clear the deadline on manual reset and new match start.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/room.test.ts tests/network.test.ts`

Expected: all early-return authorization and auto-return tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/protocol.ts src/server/room.ts src/server/network.ts tests/room.test.ts tests/network.test.ts
git commit -m "feat: return finished matches to lobby"
```

### Task 7: Build the 60 Hz Fixed Loop and Adaptive Volatile Snapshots

**Files:**
- Create: `src/server/fixed-loop.ts`
- Create: `src/server/performance.ts`
- Create: `tests/fixed-loop.test.ts`
- Create: `tests/performance.test.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Modify: `tests/network.test.ts`

- [ ] **Step 1: Write failing fixed-loop and percentile tests**

Assert exact 60 Hz stepping, a maximum of three catch-up steps, dropped-time accounting, and correct P95/P99 values for deterministic samples.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/fixed-loop.test.ts tests/performance.test.ts`

Expected: FAIL because loop and metrics modules are missing.

- [ ] **Step 3: Implement the fixed-step accumulator**

```ts
export class FixedStepAccumulator {
  private accumulatorMs = 0;
  private lastNowMs: number | null = null;
  droppedMs = 0;

  constructor(readonly stepMs: number, readonly maxCatchUpSteps = 3) {}
  advance(nowMs: number, step: (deltaMs: number) => void): number;
}
```

Clamp negative elapsed time to zero. Run no more than `maxCatchUpSteps`, preserve a sub-step remainder, and add excess full steps to `droppedMs`.

- [ ] **Step 4: Implement bounded metrics**

```ts
export class RollingMetric {
  constructor(private readonly capacity = 600) {}
  add(value: number): void;
  snapshot(): { count: number; p50: number; p95: number; p99: number; max: number };
}
```

Store a ring buffer, sort a copy for percentiles, and return zeros for an empty buffer.

- [ ] **Step 5: Queue only latest player input per simulation tick**

Change `GameRoom.handleInput` to validate ownership and store the highest-sequence input in `pendingInputs`. At the beginning of `tick`, apply each pending input once and clear the map.

- [ ] **Step 6: Replace direct interval simulation**

Poll the accumulator with a short timer, use `performance.now()` as the monotonic clock, call `room.tick(SERVER_TICK_MS)` for each produced step, and record each step duration.

- [ ] **Step 7: Add per-client snapshot cadence and performance hint**

```ts
interface PerformanceHint { snapshotMode: "full" | "reduced"; frameP95Ms: number }
interface SocketData { snapshotRate: 20 | 30; nextSnapshotAt: number }
```

On each 30 Hz snapshot opportunity, iterate connected sockets. Use `socket.volatile.emit("gameState", snapshot)` only when that socket's deadline is due. A valid performance hint selects 30 or 20 Hz for that socket. Reliable room and result events remain ordinary emits.

- [ ] **Step 8: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/fixed-loop.test.ts tests/performance.test.ts tests/network.test.ts tests/room.test.ts`

Expected: fixed loop, latest-input, volatile snapshot, and per-client cadence tests pass.

- [ ] **Step 9: Commit**

```powershell
git add src/server/fixed-loop.ts src/server/performance.ts src/shared/protocol.ts src/server/room.ts src/server/network.ts tests/fixed-loop.test.ts tests/performance.test.ts tests/network.test.ts tests/room.test.ts
git commit -m "perf: add fixed loop and adaptive snapshots"
```

### Task 8: Add Time-Based Interpolation and Input Reconciliation

**Files:**
- Create: `src/client/snapshot-buffer.ts`
- Create: `src/client/input-reconciliation.ts`
- Create: `tests/snapshot-buffer.test.ts`
- Create: `tests/input-reconciliation.test.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/mobile-app.ts`

- [ ] **Step 1: Write failing pure client tests**

Test interpolation between two timestamped positions, bounded extrapolation when one snapshot is late, removal of acknowledged input, replay of unacknowledged input from the server position, and correction distance reporting.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/snapshot-buffer.test.ts tests/input-reconciliation.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement timestamp interpolation**

```ts
export class SnapshotBuffer<T extends { serverTime: number }> {
  constructor(private readonly maxEntries = 12) {}
  push(snapshot: T): void;
  sample(renderServerTime: number): { older: T; newer: T; alpha: number } | null;
}
```

Sort by server time, replace duplicate timestamps, trim oldest entries, and clamp alpha to `[0, 1]`. Use a 100 ms render delay at 30 Hz and 150 ms in reduced mode.

- [ ] **Step 4: Implement pending input reconciliation**

```ts
export interface TimedInput { input: PlayerInput; deltaMs: number }
export class InputReconciler {
  add(input: PlayerInput, deltaMs: number): void;
  reconcile(authoritative: PlayerSnapshot): { position: Vec2; correctionDistance: number };
}
```

Drop inputs with `seq <= authoritative.lastProcessedInput`, replay the remainder through `predictLocalPosition`, and cap visible correction consumption to 30 world units per rendered second unless the error exceeds 80, which performs one explicit hard correction and increments a diagnostic counter.

- [ ] **Step 5: Integrate both paths into Phaser**

Use reconciled prediction only for the local player. Sample remote players and projectiles from `SnapshotBuffer` using estimated server time. Remove frame-rate-dependent `Phaser.Math.Linear(..., 0.34)` position interpolation.

- [ ] **Step 6: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/snapshot-buffer.test.ts tests/input-reconciliation.test.ts tests/prediction.test.ts`

Expected: all interpolation, replay, collision prediction, and correction tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/client/snapshot-buffer.ts src/client/input-reconciliation.ts src/client/game-scene.ts src/client/mobile-app.ts tests/snapshot-buffer.test.ts tests/input-reconciliation.test.ts
git commit -m "perf: smooth client interpolation and reconciliation"
```

### Task 9: Replace Fixed Sticks with Half-Screen Floating Sticks

**Files:**
- Modify: `index.html`
- Modify: `src/client/virtual-stick.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Modify: `tests/virtual-stick.test.ts`

- [ ] **Step 1: Write failing floating-origin tests**

Test that pointer down sets the base origin, movement is relative to that origin, the wrong pointer ID is ignored, pointer cancel returns zero, and separate left/right instances keep independent state.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/virtual-stick.test.ts`

Expected: FAIL because the current stick is anchored to a fixed element center.

- [ ] **Step 3: Change the stick API to a touch zone and visual element**

```ts
export class VirtualStick {
  constructor(private readonly zone: HTMLElement, private readonly visual: HTMLElement, private readonly radius = 64) {}
  getValue(): StickValue;
  dispose(): void;
}
```

Store `originX` and `originY` from the accepted pointer down. Position the visual with `translate3d(originX, originY, 0)`, calculate the knob from pointer minus origin, capture that pointer, and hide/reset on up, cancel, blur, or lost capture.

- [ ] **Step 4: Replace fixed controls with two half-screen zones**

Render `#move-zone` and `#aim-zone` as invisible left/right halves of `.control-layer`; render the two `.virtual-stick` visuals as hidden absolute children. Keep the HUD above the playfield visually but set HUD pointer events to none during play.

- [ ] **Step 5: Harden browser gesture suppression**

Set the viewport content to `width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, viewport-fit=cover, user-scalable=no`. Apply `touch-action: none`, `overscroll-behavior: none`, `user-select: none`, and `-webkit-touch-callout: none` only to arena/control surfaces. Prevent `gesturestart` and double-tap default behavior while the arena is active; do not block lobby input fields.

- [ ] **Step 6: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/virtual-stick.test.ts`

Expected: all floating, multi-pointer, cancel, and normalization tests pass.

- [ ] **Step 7: Commit**

```powershell
git add index.html src/client/virtual-stick.ts src/client/mobile-app.ts src/client/styles.css tests/virtual-stick.test.ts
git commit -m "feat: add floating dual touch controls"
```

### Task 10: Add Camera Follow, Rich Terrain Rendering, and Thick Aim Guide

**Files:**
- Create: `src/client/aim-guide.ts`
- Create: `tests/aim-guide.test.ts`
- Modify: `src/client/game-scene.ts`

- [ ] **Step 1: Write failing aim endpoint tests**

Test maximum range, center-line wall truncation, no truncation for a wall behind the player, and stable zero-aim behavior.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/aim-guide.test.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement pure guide geometry**

```ts
export function calculateAimGuide(
  origin: Vec2,
  aim: Vec2,
  maxDistance: number,
  walls: readonly Rect[],
): { start: Vec2; end: Vec2; angle: number; length: number; visible: boolean };
```

Normalize aim, return invisible below magnitude `0.15`, and use `firstWallHit(origin, aim * maxDistance, 0, walls)` to truncate the endpoint.

- [ ] **Step 4: Configure the Phaser viewport and camera**

Set game dimensions to `VIEW_WIDTH x VIEW_HEIGHT`, draw the full `ARENA_WIDTH x ARENA_HEIGHT` world, set camera bounds, and call `startFollow(localView.container, true, 0.12, 0.12)` after the local view exists. Stop following on finish and use a 250 ms pan when respawn changes position.

- [ ] **Step 5: Render all v2 terrain rectangles**

Continue rendering from `WALLS`; add lane markings for the outer loop, side routes, and central contest area without adding new collision geometry in the renderer.

- [ ] **Step 6: Render the thick attack corridor**

Use a Phaser rectangle with height `64`, origin `(0, 0.5)`, translucent fill, and a terminal circle/crosshair. Update its position, rotation, and width from `calculateAimGuide` every render frame. Hide it when the right stick is below dead zone, local player is dead, or the match is finished.

- [ ] **Step 7: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/aim-guide.test.ts tests/spawn-layout.test.ts`

Expected: guide geometry and map layout tests pass.

- [ ] **Step 8: Commit**

```powershell
git add src/client/aim-guide.ts src/client/game-scene.ts tests/aim-guide.test.ts
git commit -m "feat: add camera arena and aim corridor"
```

### Task 11: Tune Normal AI and Complete Mobile Hold/Result UI

**Files:**
- Modify: `src/server/bot.ts`
- Modify: `src/server/room.ts`
- Modify: `tests/bot.test.ts`
- Modify: `tests/room.test.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/network.ts`
- Modify: `src/client/styles.css`
- Modify: `tests/host-state.test.ts`

- [ ] **Step 1: Write failing AI behavior tests**

Assert no fire beyond 520 units, wider deterministic aim error, a decision interval of 300-450 ms in room scheduling, target abandonment beyond pursuit range, and retreat at low health.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- --run tests/bot.test.ts tests/room.test.ts`

Expected: old 680-unit fire range and 180-300 ms schedule fail.

- [ ] **Step 3: Apply normal AI constants and target persistence**

Use fire distance `520`, retreat trigger `40`, pursuit break distance `720`, think interval `300 + random * 150`, and angular error `(random() - 0.5) * 0.44`. Store a short-lived target ID per bot in `GameRoom`; clear it when dead, outside pursuit range, or a closer energy objective wins.

- [ ] **Step 4: Add hold and automatic-return presentation**

Show holder name plus `ceil(holdRemainingMs / 1000)` in the existing match-clock area. In results, add a unique `#return-lobby` button and `#return-countdown`. Call `network.returnToLobby()` on click and derive countdown from `finishedAt + LOBBY_RETURN_DELAY_MS - serverTime`.

- [ ] **Step 5: Add client performance hints**

Collect rolling `requestAnimationFrame` intervals. Every two seconds send `full` when P95 is at most 24 ms and `reduced` when P95 remains above 24 ms for two windows. Do not render these values in the mobile HUD.

- [ ] **Step 6: Run and verify GREEN**

Run: `npm.cmd test -- --run tests/bot.test.ts tests/room.test.ts tests/host-state.test.ts`

Expected: all AI, holder display state, and result lifecycle tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/server/bot.ts src/server/room.ts src/client/mobile-app.ts src/client/network.ts src/client/styles.css tests/bot.test.ts tests/room.test.ts tests/host-state.test.ts
git commit -m "feat: tune ai and complete v2 match flow"
```

### Task 12: Add Diagnostics, Six-Client Load Test, and Release Verification

**Files:**
- Create: `scripts/load-test.ts`
- Modify: `package.json`
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/performance.ts`
- Modify: `src/server/network.ts`
- Modify: `src/client/host-app.ts`
- Modify: `src/client/styles.css`
- Modify: `README.md`

- [ ] **Step 1: Expose read-only diagnostics**

Add a host-token-protected `getDiagnostics` event returning server step P50/P95/P99/max, event-loop lag, emitted/dropped snapshots, input age, connected socket cadence, active projectiles, and current snapshot byte size. Render compact values in an unframed diagnostics band on the host page.

- [ ] **Step 2: Add the deterministic six-client harness**

Create six Socket.IO clients, join with all six colors, prepare, start through the supplied host token, and send normalized circular movement plus rotating aim at 30 Hz. Run for `LOAD_TEST_SECONDS` (default 600), collect each client's snapshot gaps and RTT, then print JSON summary and exit nonzero when any approved P95/P99 threshold fails.

In `src/server/index.ts`, allow a deterministic token only in an explicit test environment:

```ts
const testHostToken = process.env.NODE_ENV === "test" ? process.env.HOST_TOKEN?.trim() : undefined;
const hostToken = testHostToken || randomBytes(18).toString("hex");
```

Add:

```json
"load-test": "tsx scripts/load-test.ts"
```

- [ ] **Step 3: Run the complete automated suite**

Run: `npm.cmd test -- --run`

Expected: every Vitest file passes with no unhandled errors.

- [ ] **Step 4: Run static and production verification**

Run: `npm.cmd run typecheck && npm.cmd run build && git diff --check`

Expected: all commands exit 0; Vite may report bundle sizes but no build failure.

- [ ] **Step 5: Run the six-client load test**

Start the server in one terminal with an explicit test-only token:

```powershell
$env:NODE_ENV='test'
$env:HOST_TOKEN='load-test-host-token'
$env:PORT='3101'
npm.cmd run server
```

Run the harness in a second terminal:

```powershell
$env:GAME_URL='http://127.0.0.1:3101'
$env:HOST_TOKEN='load-test-host-token'
$env:LOAD_TEST_SECONDS='600'
npm.cmd run load-test
```

Expected: six clients remain connected for ten minutes; server step P95 < 4 ms and P99 < 8 ms; event-loop lag P95 < 20 ms; snapshot gap P95 < 80 ms at full cadence; no growing input, snapshot, or projectile count.

- [ ] **Step 6: Perform browser playtest at representative landscape sizes**

Test `844 x 390`, `932 x 430`, and `667 x 375`. Complete join, ready, start, two-finger move/fire, wall sliding, aim-guide wall truncation, holder countdown, forced finish, early return, and automatic return. Capture screenshots of active play and results. Check console warnings/errors and DOM scroll dimensions.

Expected: no page zoom or scroll; camera stays in bounds; both sticks can operate simultaneously from arbitrary half-screen origins; no visible hard correction; no wall tunneling; HUD remains readable; console has no errors.

- [ ] **Step 7: Update operator documentation**

Document v2.0 rules, 8-minute/15-point hold flow, floating controls, firewall/client-isolation advice, diagnostics interpretation, load-test command, and the explicit v3.0 character/skill deferral.

- [ ] **Step 8: Commit release verification assets**

```powershell
git add scripts/load-test.ts package.json src/shared/protocol.ts src/server/index.ts src/server/performance.ts src/server/network.ts src/client/host-app.ts src/client/styles.css README.md
git commit -m "chore: add v2 performance verification"
```

- [ ] **Step 9: Final release gate**

Run: `npm.cmd test -- --run && npm.cmd run typecheck && npm.cmd run build && git status --short`

Expected: tests, typecheck, and build pass; status contains no unintended generated or unrelated files. Do not declare v2.0 complete unless the worst of six clients satisfies the approved smoothness thresholds.
