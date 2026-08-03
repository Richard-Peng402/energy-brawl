# Energy Brawl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LAN-hosted, mobile-landscape, six-seat arena game with server-authoritative combat, bot fill, reconnect support, host controls, and a complete lobby-to-results loop.

**Architecture:** A single TypeScript repository contains shared serializable protocol types, a deterministic Node.js game simulation, an Express/Socket.IO server, and a Phaser/Vite browser client. The server owns all gameplay state and serves the production client; phones send normalized inputs and interpolate server snapshots.

**Tech Stack:** Node.js, TypeScript, Express, Socket.IO, Phaser, Vite, Vitest, QRCode, HTML/CSS

---

## File Map

- `package.json`: scripts and runtime/development dependencies.
- `tsconfig.json`: strict shared TypeScript configuration.
- `vite.config.ts`: client build, LAN dev host, and server proxies.
- `index.html`: browser entry point for both phone and host views.
- `src/shared/constants.ts`: game tuning constants.
- `src/shared/protocol.ts`: client/server event and snapshot types.
- `src/shared/math.ts`: vector, clamp, distance, and collision helpers.
- `src/server/simulation.ts`: authoritative fixed-step world simulation.
- `src/server/bot.ts`: fair bot input selection.
- `src/server/room.ts`: lobby, seats, reconnect, match lifecycle, and snapshot creation.
- `src/server/network.ts`: Socket.IO validation and event wiring.
- `src/server/index.ts`: Express hosting, QR/address API, and server startup.
- `src/client/main.ts`: route selection and app bootstrap.
- `src/client/network.ts`: typed socket client and reconnect token handling.
- `src/client/mobile-app.ts`: lobby, Phaser mount, HUD, results, and orientation states.
- `src/client/host-app.ts`: QR, roster, start/end/restart, and diagnostics.
- `src/client/game-scene.ts`: arena rendering, entity interpolation, particles, and camera.
- `src/client/virtual-stick.ts`: stable pointer-based dual-stick input.
- `src/client/styles.css`: responsive landscape mobile and desktop host styling.
- `tests/math.test.ts`: shared geometry tests.
- `tests/simulation.test.ts`: damage, score, respawn, energy, win, and overtime tests.
- `tests/bot.test.ts`: bot collection, combat, and retreat decisions.
- `tests/room.test.ts`: seat fill, readiness, disconnect takeover, reconnect, and reset tests.
- `tests/network.test.ts`: socket validation and host authorization integration tests.
- `scripts/start-game.ps1`: Windows one-command build and server launch.
- `启动游戏.bat`: double-click launcher.
- `README.md`: setup, LAN use, firewall, router, and controls.

### Task 1: Project scaffold and shared contract

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/shared/constants.ts`
- Create: `src/shared/protocol.ts`
- Create: `src/shared/math.ts`
- Test: `tests/math.test.ts`

- [ ] **Step 1: Write failing geometry tests**

```ts
import { describe, expect, it } from "vitest";
import { clamp, circleHitsRect, normalize } from "../src/shared/math";

describe("shared math", () => {
  it("normalizes without producing NaN", () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
  });

  it("clamps values and detects circle/rectangle overlap", () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(circleHitsRect({ x: 10, y: 10 }, 4, { x: 12, y: 8, width: 5, height: 5 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and confirm the missing-module failure**

Run: `npm test -- --run tests/math.test.ts`

Expected: FAIL because `src/shared/math.ts` does not exist.

- [ ] **Step 3: Add the strict project configuration, scripts, protocol, constants, and math helpers**

Define `Vec2`, `Rect`, `PlayerInput`, `PlayerSnapshot`, `ProjectileSnapshot`, `EnergySnapshot`, `RoomSnapshot`, `GameSnapshot`, and typed event maps. Use constants for six seats, 100 health, 25 damage, 3 kill points, 1 energy point, 15 target points, 300-second normal match time, three-second respawn, and a 20 Hz server tick. Implement pure `clamp`, `length`, `normalize`, `distanceSquared`, `circleHitsRect`, and `circleHitsCircle` functions.

- [ ] **Step 4: Install dependencies and run shared tests/typecheck**

Run: `npm install`

Run: `npm test -- --run tests/math.test.ts && npm run typecheck`

Expected: all math tests pass and TypeScript exits successfully.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/shared tests/math.test.ts
git commit -m "build: scaffold energy brawl project"
```

### Task 2: Authoritative simulation

**Files:**
- Create: `src/server/simulation.ts`
- Test: `tests/simulation.test.ts`

- [ ] **Step 1: Write failing simulation tests**

```ts
it("awards three points for a defeat and respawns the victim", () => {
  const world = createTestWorld();
  damagePlayer(world, "blue", "red", 100);
  expect(world.players.get("red")?.score).toBe(3);
  expect(world.players.get("blue")?.alive).toBe(false);
  stepWorld(world, RESPAWN_SECONDS + 0.01);
  expect(world.players.get("blue")?.alive).toBe(true);
});

it("ends immediately when a player reaches fifteen", () => {
  const world = createTestWorld();
  world.players.get("red")!.score = 14;
  collectEnergy(world, "red", "energy-1");
  expect(world.phase).toBe("finished");
  expect(world.winnerIds).toEqual(["red"]);
});
```

- [ ] **Step 2: Run the tests and verify missing simulation exports**

Run: `npm test -- --run tests/simulation.test.ts`

Expected: FAIL because the simulation module is missing.

- [ ] **Step 3: Implement fixed-step movement, collision, shooting, damage, scoring, energy, respawn, time limit, and sudden death**

Use a `GameWorld` containing maps for players, projectiles, and energy plus phase/timer fields. Clamp input vectors, resolve player circles against arena bounds and walls, enforce fire cooldowns, advance projectiles, detect hits, and remove expired projectiles. At normal-time expiry finish for a sole leader or enter `overtime` for tied leaders; in overtime only a tied leader's next score finishes the match.

- [ ] **Step 4: Run simulation tests and typecheck**

Run: `npm test -- --run tests/simulation.test.ts && npm run typecheck`

Expected: all simulation cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/simulation.ts tests/simulation.test.ts
git commit -m "feat: add authoritative game simulation"
```

### Task 3: Fair bot inputs and room lifecycle

**Files:**
- Create: `src/server/bot.ts`
- Create: `src/server/room.ts`
- Test: `tests/bot.test.ts`
- Test: `tests/room.test.ts`

- [ ] **Step 1: Write failing bot and room tests**

```ts
it("moves toward nearby energy when no enemy is urgent", () => {
  const input = chooseBotInput(worldWithEnergyAt(500, 300), "bot-1", 1);
  expect(input.moveX).toBeGreaterThan(0);
});

it("fills all empty seats with bots on start", () => {
  const room = new GameRoom();
  room.joinHuman("socket-1", { nickname: "玩家一", color: "#ff5a5f" });
  room.setReady("socket-1", true);
  room.startMatch();
  expect(room.snapshot().players).toHaveLength(6);
  expect(room.snapshot().players.filter((player) => player.isBot)).toHaveLength(5);
});
```

- [ ] **Step 2: Run tests and confirm bot/room modules are missing**

Run: `npm test -- --run tests/bot.test.ts tests/room.test.ts`

Expected: FAIL on missing imports.

- [ ] **Step 3: Implement deterministic bot decisions and room state transitions**

`chooseBotInput` must use only world state, a reaction timer, aim error, and a seeded random source. `GameRoom` must sanitize nicknames, reserve colors, require one ready human, fill to six, map sockets to reconnect tokens, replace disconnected humans with controlled bots, restore control within 30 seconds, and reset cleanly to the lobby.

- [ ] **Step 4: Run bot/room tests and the full unit suite**

Run: `npm test -- --run tests/bot.test.ts tests/room.test.ts && npm test -- --run`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/bot.ts src/server/room.ts tests/bot.test.ts tests/room.test.ts
git commit -m "feat: add bot fill and room lifecycle"
```

### Task 4: Express and Socket.IO server

**Files:**
- Create: `src/server/network.ts`
- Create: `src/server/index.ts`
- Test: `tests/network.test.ts`

- [ ] **Step 1: Write failing socket integration tests**

```ts
it("rejects blank nicknames and accepts a valid player", async () => {
  const harness = await createNetworkHarness();
  const client = harness.connect();
  expect(await emitAck(client, "join", { nickname: "   ", color: "#ff5a5f" })).toMatchObject({ ok: false });
  expect(await emitAck(client, "join", { nickname: "小明", color: "#ff5a5f" })).toMatchObject({ ok: true });
  await harness.close();
});
```

- [ ] **Step 2: Run the integration test and confirm missing server wiring**

Run: `npm test -- --run tests/network.test.ts`

Expected: FAIL on missing network harness.

- [ ] **Step 3: Implement HTTP hosting, APIs, typed sockets, rate limiting, room ticking, and host commands**

Expose `/api/info` with LAN addresses and room state. Socket events must use acknowledgements for join, ready, reconnect, host start, host end, and restart. Accept inputs only for the socket's active seat, cap input frequency, and broadcast room changes immediately plus game snapshots at the configured rate. Generate a random host token printed only in the server console and embedded in the local host URL.

- [ ] **Step 4: Run integration tests and all checks**

Run: `npm test -- --run tests/network.test.ts && npm run typecheck`

Expected: socket tests pass and TypeScript is clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/network.ts src/server/index.ts tests/network.test.ts
git commit -m "feat: expose LAN game server"
```

### Task 5: Browser shell, lobby, and host dashboard

**Files:**
- Create: `src/client/main.ts`
- Create: `src/client/network.ts`
- Create: `src/client/mobile-app.ts`
- Create: `src/client/host-app.ts`
- Create: `src/client/styles.css`

- [ ] **Step 1: Add a browser smoke test target through the production build**

Run: `npm run build`

Expected before implementation: FAIL because the client entry is missing.

- [ ] **Step 2: Implement route selection and typed network state**

Use `/host?token=...` for the desktop dashboard and `/` for phones. Persist reconnect token in `localStorage`, expose connection states, and keep all socket subscriptions disposable.

- [ ] **Step 3: Implement the mobile lobby and results views**

Build nickname/color entry, six stable roster slots, ready toggle, orientation blocker, connection banner, results table, and next-round ready action. Disable unavailable colors and invalid actions using server acknowledgement errors.

- [ ] **Step 4: Implement the host dashboard**

Show the game title as the primary first-viewport signal, QR code, large join URL, six-seat roster, phase/status counters, start/end/restart commands, and concise LAN troubleshooting. Host commands remain disabled without the server-generated token.

- [ ] **Step 5: Build and typecheck**

Run: `npm run build && npm run typecheck`

Expected: Vite emits production assets and TypeScript passes.

- [ ] **Step 6: Commit**

```bash
git add src/client/main.ts src/client/network.ts src/client/mobile-app.ts src/client/host-app.ts src/client/styles.css
git commit -m "feat: add lobby and host dashboard"
```

### Task 6: Phaser arena and touch controls

**Files:**
- Create: `src/client/game-scene.ts`
- Create: `src/client/virtual-stick.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`

- [ ] **Step 1: Implement a stable pointer-based virtual stick**

Track pointers by identifier, clamp knob travel to a fixed radius, normalize output to `[-1, 1]`, preserve layout dimensions during pointer changes, and reset on pointer cancel or loss of focus.

- [ ] **Step 2: Implement the Phaser scene**

Render arena markings, obstacles, energy cores, players, projectiles, names, health bars, spawn shields, hit flashes, collection bursts, and a restrained camera shake. Interpolate remote entities between snapshots and keep the local player visually responsive between server corrections.

- [ ] **Step 3: Connect dual-stick input and the DOM HUD**

Sample both sticks into sequenced `PlayerInput` messages. Update health, own score, target score, timer, phase, leaderboard, network state, off-screen indicators, respawn countdown, and overtime label without resizing controls.

- [ ] **Step 4: Verify build and unit tests**

Run: `npm run build && npm test -- --run && npm run typecheck`

Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/game-scene.ts src/client/virtual-stick.ts src/client/mobile-app.ts src/client/styles.css
git commit -m "feat: add mobile arena controls and rendering"
```

### Task 7: Windows deployment and documentation

**Files:**
- Create: `scripts/start-game.ps1`
- Create: `启动游戏.bat`
- Create: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Add production start scripts**

The PowerShell script must resolve its own project directory, verify `node` and `npm`, install packages only when `node_modules` is absent, build the Vite client, start the server, and print actionable failures. The batch file delegates to PowerShell without changing machine-wide execution policy.

- [ ] **Step 2: Document setup and LAN troubleshooting**

Document Node.js prerequisite, double-click launch, Windows private-network firewall permission, wired host recommendation, phone QR flow, controls, AP/client isolation, and shutdown with `Ctrl+C`.

- [ ] **Step 3: Run the production build and server smoke test**

Run: `npm run build`

Run: `npm run server`

Expected: server prints the local host dashboard and phone join addresses, and `/api/info` returns JSON.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/start-game.ps1 启动游戏.bat README.md
git commit -m "docs: add Windows LAN launcher"
```

### Task 8: End-to-end mobile playtest and final verification

**Files:**
- Modify only files implicated by verified failures.

- [ ] **Step 1: Start the production server and open the host dashboard**

Run: `npm run build && npm run server`

Expected: one host page loads with a nonblank QR code and reports an empty lobby.

- [ ] **Step 2: Exercise the complete flow at desktop and mobile landscape viewports**

Join one human, ready, start with five bots, move, fire, collect energy, observe damage/respawn, finish a match, view results, and restart. Verify 390x844 landscape-equivalent and common desktop host viewports have no overlap or clipped text.

- [ ] **Step 3: Verify reconnect and authority behavior**

Disconnect the phone client, confirm bot takeover, reconnect within 30 seconds, and confirm the same score/seat is restored. Send malformed and high-rate inputs from the integration harness and confirm the server rejects or throttles them.

- [ ] **Step 4: Run the final automated checks**

Run: `npm test -- --run && npm run typecheck && npm run build && git diff --check`

Expected: all tests pass, typecheck and production build succeed, and Git reports no whitespace errors.

- [ ] **Step 5: Commit verified fixes**

```bash
git add -A
git commit -m "test: verify complete LAN game flow"
```
