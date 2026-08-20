# Multiplayer Experience Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add isolated multi-room discovery, explicit bot handover/reconnect feedback, a cancellable ready countdown, continuous rematches, stronger team cues, and a player-visible network health HUD without duplicating existing combat systems.

**Architecture:** Keep `GameRoom` as the authoritative single-room simulation. Add a small in-memory `RoomDirectory` around it, extend the shared Socket.IO protocol with room/session metadata, and expose a client `NetworkHealth` model that consumes application-heartbeat samples. Add an explicit lobby/countdown/results/role-select lifecycle while preserving the existing match phase inside a room.

**Tech Stack:** TypeScript, Socket.IO 4, Vitest, Vite/DOM UI, existing Phaser client.

---

### Task 1: Establish room-directory domain types

**Files:**
- Create: `src/server/room-directory.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/room-directory.test.ts`

- [ ] **Step 1: Write failing tests for code generation and isolation**

```ts
it("creates unique six-character room codes and lists only joinable rooms", () => {
  const directory = new RoomDirectory();
  const created = directory.createRoom("socket-host");
  expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
  expect(directory.list()).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: created.code, playerCount: 0, phase: "lobby" }),
  ]));
});

it("does not route a reconnect token from one room into another", () => {
  const directory = new RoomDirectory();
  const first = directory.createRoom("socket-a");
  const second = directory.createRoom("socket-b");
  expect(directory.get(first.code)).not.toBe(directory.get(second.code));
  expect(directory.findByReconnectToken("unknown-token")).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/room-directory.test.ts`
Expected: FAIL because `RoomDirectory` and the room-directory snapshot types do not exist.

- [ ] **Step 3: Implement the minimal directory API**

Add `RoomDirectory` with `createRoom(hostSocketId)`, `get(code)`, `list()`, `findJoinable()`, `findByReconnectToken(token)`, `removeIfEmpty(code, now)`, and `roomCount()`. Use a `Map<string, GameRoom>` and a cryptographically random six-character code generator with collision retry. Add `RoomDirectorySnapshot`, `RoomSummary`, `RoomPhase`, `JoinRoomPayload`, and `ReconnectPayload.roomCode?` to `protocol.ts` while keeping the existing token field compatible.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npm test -- --run tests/room-directory.test.ts` and `npm run typecheck`
Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/room-directory.ts src/shared/protocol.ts tests/room-directory.test.ts
git commit -m "feat: add isolated room directory"
```

### Task 2: Route Socket.IO connections through rooms

**Files:**
- Modify: `src/server/network.ts`
- Modify: `src/server/index.ts`
- Modify: `src/client/network.ts`
- Test: `tests/network-rooms.test.ts`

- [ ] **Step 1: Write failing protocol-flow tests**

Test creating a room, listing it, joining by code, quick joining a joinable room, rejecting a full/playing room, and asserting that `roomState` broadcasts never cross room codes.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/network-rooms.test.ts`
Expected: FAIL because the server currently constructs one global `GameRoom` and has no room events.

- [ ] **Step 3: Add room events and routing**

Add `createRoom`, `listRooms`, `joinRoom`, and `quickJoin` acknowledgements to the shared event maps. Make `network.ts` own a `RoomDirectory`, resolve a socket's active room before all existing game handlers, and broadcast room state only through that room's Socket.IO room. Keep a compatibility path that creates the first default room so existing local URLs still work. Include `roomCode` in `JoinResult` and in local storage.

- [ ] **Step 4: Implement client room API**

Add `listRooms()`, `createRoom()`, `joinRoom(code)`, and `quickJoin()` methods to `GameNetworkClient`; emit a new `roomDirectory` event to `MobileApp` and render the list/code controls in the existing lobby.

- [ ] **Step 5: Run focused tests, build, and commit**

Run: `npm test -- --run tests/network-rooms.test.ts tests/network.test.ts`, `npm run typecheck`, `npm run build`

```bash
git add src/server/network.ts src/server/index.ts src/client/network.ts src/shared/protocol.ts src/client/mobile-app.ts tests/network-rooms.test.ts
git commit -m "feat: support room codes and quick join"
```

### Task 3: Make handover and reconnect state explicit

**Files:**
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/client/network.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/player-handover.test.ts`

- [ ] **Step 1: Write failing handover tests**

Cover: disconnect during play sets `controlOwner: "bot"` without changing player state; reconnect within 90 seconds restores `controlOwner: "human"`; expiry removes the seat; events arrive as `botTakeover` then `humanControlRestored` with the same player ID.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/player-handover.test.ts`
Expected: FAIL because snapshots only expose `isBot/connected` and no handover event exists.

- [ ] **Step 3: Add explicit session fields and events**

Extend `RoomSeat` with `controlOwner` and `handoverSeq`; change the reconnect-window constant to 90 seconds. Add `PlayerControlOwner`, `PlayerHandoverEvent`, and `ServerToClientEvents.playerHandover`. Preserve the existing world entity and all combat state. Emit the event once per transition from `disconnect()` and `reconnectHuman()`.

- [ ] **Step 4: Restore client identity and render notices**

Persist `roomCode` with the existing token/player ID keys. On reconnect, send the room code and token together. Track handover events in `MobileApp`, show a non-blocking “AI 接管/已恢复控制” notice, and label the affected roster entry.

- [ ] **Step 5: Run reconnect regressions and commit**

Run: `npm test -- --run tests/player-handover.test.ts tests/team-elimination-reconnect.test.ts tests/network-faults.test.ts`

```bash
git add src/server/room.ts src/server/network.ts src/shared/protocol.ts src/client/network.ts src/client/mobile-app.ts src/client/styles.css tests/player-handover.test.ts
git commit -m "feat: expose bot handover and reconnect recovery"
```

### Task 4: Add the room lifecycle countdown and continuous rematch

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Modify: `src/client/network.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/room-lifecycle.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Assert `startMatch()` enters a five-second countdown, `advance()` publishes remaining milliseconds, any human unready cancels it, finished matches enter role selection with seats retained and `ready=false`, and all selected/ready players trigger the next countdown when auto-rematch is enabled.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/room-lifecycle.test.ts`
Expected: FAIL because `GamePhase` has no countdown/role-select phases and `startMatch()` starts immediately.

- [ ] **Step 3: Implement an explicit room lifecycle**

Add `RoomLifecyclePhase = "lobby" | "countdown" | "playing" | "results" | "roleSelect"` and a `countdownEndsAt` field separate from simulation time. Gate `startMatch()` on human readiness, set a 5,000 ms deadline, cancel on readiness/seat changes, and transition to `playing` when elapsed. On finish, keep the room, set `roleSelect`, clear readiness, preserve teams, and expose `autoRematch` in the room settings. Do not change the inner `GamePhase` used by combat snapshots.

- [ ] **Step 4: Wire client controls and countdown UI**

Render phase-aware lobby controls, a large countdown label, a “重新选角” transition, and an auto-rematch toggle for the host. Keep the existing results return button as an explicit fallback; automatic rematch must still require fresh readiness.

- [ ] **Step 5: Run lifecycle and existing room tests, then commit**

Run: `npm test -- --run tests/room-lifecycle.test.ts tests/room.test.ts tests/team-elimination-room.test.ts`, `npm run typecheck`

```bash
git add src/shared/protocol.ts src/server/room.ts src/server/network.ts src/client/network.ts src/client/mobile-app.ts src/client/styles.css tests/room-lifecycle.test.ts
git commit -m "feat: add ready countdown and continuous rematches"
```

### Task 5: Add network health model and HUD

**Files:**
- Create: `src/client/network-health.ts`
- Modify: `src/client/network.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/network-health.test.ts`

- [ ] **Step 1: Write failing rolling-window tests**

```ts
it("reports RTT, heartbeat loss, reconnects, and a stable severity", () => {
  const health = new NetworkHealth({ windowSize: 10 });
  health.recordHeartbeat({ sentAt: 0, receivedAt: 80 });
  health.recordHeartbeat({ sentAt: 1000, receivedAt: null });
  health.recordReconnect();
  expect(health.snapshot()).toMatchObject({ rttMs: 80, lossPercent: 50, reconnects: 1, level: "unstable" });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/network-health.test.ts`
Expected: FAIL because no player-facing rolling health model exists.

- [ ] **Step 3: Implement the model and client sampling**

Implement `NetworkHealth` with a bounded sample queue, median RTT, lost-sample percentage, reconnect counter, and thresholds (`good <=120ms and <5%`, `unstable <=250ms or <15%`, otherwise `poor`). Have `GameNetworkClient` send a sequence-numbered heartbeat every 2 seconds, record timeout after 1 second, and expose an `onNetworkHealth` callback. Keep host diagnostics untouched.

- [ ] **Step 4: Add a compact responsive HUD**

Add a fixed, non-blocking network badge to the existing HUD. It must show level, `延迟 xxms`, `心跳丢失 x%`, and `重连 n 次`; collapse to an icon plus tooltip on narrow phone widths and never cover the right-side attack/skill controls.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- --run tests/network-health.test.ts tests/diagnostics-collector.test.ts`, `npm run build`

```bash
git add src/client/network-health.ts src/client/network.ts src/client/mobile-app.ts src/client/styles.css tests/network-health.test.ts
git commit -m "feat: show player network health"
```

### Task 6: Strengthen teammate cues and complete verification

**Files:**
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/team-identity-ui.test.ts`
- Test: `tests/multiplayer-experience-regression.test.ts`

- [ ] **Step 1: Write failing UI assertions**

Assert teammate markers use team ID plus a non-color shape/icon, bot takeover labels are present, the countdown and network badge have responsive classes, and role-selection rematch keeps the room code visible.

- [ ] **Step 2: Implement visual cues without changing combat rendering**

Use existing team colors and sprites; add outline/arrow/nameplate metadata for allies, a distinct neutral bot badge, and a short-lived takeover toast. Keep all overlays in existing HUD layers and preserve full-quality effects.

- [ ] **Step 3: Run targeted and full verification**

Run: `npm test -- --run tests/team-identity-ui.test.ts tests/multiplayer-experience-regression.test.ts`, `npm run typecheck`, `npm run build`, `npm test -- --run`, `npm run load-test:v4`.

- [ ] **Step 4: Run six-client network smoke test**

Run the existing server with six simulated clients, disconnect two clients for 10 seconds, reconnect them, complete one rematch, and assert no cross-room snapshots, no lost player state, and a bounded heartbeat loss report. Save the output under `artifacts/multiplayer-experience/`.

- [ ] **Step 5: Commit the completed feature**

```bash
git add src tests artifacts/multiplayer-experience
git commit -m "feat: improve multiplayer room and reconnect experience"
```
