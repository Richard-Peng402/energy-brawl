# Energy Brawl v4.3.2 Host Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-only real-time diagnostics panel and ten-match JSON report history that identifies network, input acknowledgement, frame, position correction, reconnect, and server-step problems without changing combat quality or timing.

**Architecture:** Clients aggregate local measurements into one-second windows and send them through a separate volatile Socket.IO event. A focused server session validates samples, attaches masked connection metadata, aggregates current-match state, and publishes it only to an authenticated loopback host subscriber. The host client renders a collapsible panel and stores only completed, sanitized reports in localStorage.

**Tech Stack:** TypeScript, Phaser 3, Socket.IO, Express, Vitest, Vite, browser localStorage and Blob downloads.

---

## File Structure

New focused modules:

- `src/shared/diagnostics.ts`: protocol types, thresholds, validators and alert classification.
- `src/client/diagnostics-collector.ts`: bounded one-second client metric aggregation.
- `src/client/device-profile.ts`: browser-exposed environment profile without model guessing.
- `src/server/diagnostics-session.ts`: current-match aggregation, authorization-independent state and report finalization.
- `src/server/network-address.ts`: canonical remote-address masking.
- `src/client/diagnostics-report-store.ts`: validated ten-report localStorage retention and export serialization.
- `src/client/host-diagnostics-view.ts`: host diagnostics HTML rendering and revision calculation.
- `scripts/diagnostics-load-test.ts`: six-client diagnostic traffic and server-budget simulation.

Existing orchestration files receive only integration code:

- `src/shared/protocol.ts`: diagnostic Socket.IO event declarations.
- `src/client/network.ts`: diagnostic send, ping and host subscription methods.
- `src/client/input-reconciliation.ts`: expose correction samples without owning aggregation.
- `src/client/game-scene.ts`: forward render-frame and correction observations.
- `src/client/mobile-app.ts`: collector lifecycle and one-second flush.
- `src/server/network.ts`: validate events, enforce host authorization and publish snapshots.
- `src/server/fixed-loop.ts`: expose catch-up-limit observations.
- `src/client/host-app.ts`: subscribe, retain reports and bind panel commands.
- `src/client/styles.css`: diagnostics layout and responsive behavior.

## Task 1: Shared Diagnostic Contract and Alert Rules

**Files:**
- Create: `src/shared/diagnostics.ts`
- Create: `tests/diagnostics-contract.test.ts`
- Modify: `src/shared/protocol.ts`

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_THRESHOLDS,
  classifyDiagnosticSample,
  isClientDiagnosticSample,
  type ClientDiagnosticSample,
} from "../src/shared/diagnostics";

const sample = (overrides: Partial<ClientDiagnosticSample> = {}): ClientDiagnosticSample => ({
  schemaVersion: 1,
  matchId: "match-1",
  sampledAt: 1_000,
  rttMs: 40,
  inputAckP50Ms: 38,
  inputAckP95Ms: 55,
  inputAckMaxMs: 70,
  frameP50Ms: 16.7,
  frameP95Ms: 18,
  frameMaxMs: 22,
  correctionP95Px: 2,
  correctionMaxPx: 4,
  hardCorrections: 0,
  stalls: 0,
  pendingInputs: 1,
  reconnects: 0,
  connected: true,
  network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false },
  ...overrides,
});

describe("diagnostic contract", () => {
  it("uses the approved fixed thresholds", () => {
    expect(DIAGNOSTIC_THRESHOLDS).toEqual({ rttMs: 120, inputAckP95Ms: 100, correctionPx: 30, frameMs: 50, serverStepMs: 16 });
  });

  it("classifies every exceeded category once", () => {
    expect(classifyDiagnosticSample(sample({ rttMs: 121, inputAckP95Ms: 101, correctionMaxPx: 31, frameMaxMs: 51, reconnects: 1 })))
      .toEqual(["network", "input", "correction", "frame", "reconnect"]);
  });

  it("rejects non-finite and oversized samples", () => {
    expect(isClientDiagnosticSample(sample({ frameMaxMs: Number.NaN }))).toBe(false);
    expect(isClientDiagnosticSample(sample({ matchId: "x".repeat(129) }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm.cmd test -- tests/diagnostics-contract.test.ts --run`

Expected: FAIL because `src/shared/diagnostics.ts` does not exist.

- [ ] **Step 3: Implement the shared contract**

Define bounded interfaces and pure validation helpers:

```ts
export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const DIAGNOSTIC_THRESHOLDS = {
  rttMs: 120,
  inputAckP95Ms: 100,
  correctionPx: 30,
  frameMs: 50,
  serverStepMs: 16,
} as const;

export type DiagnosticAlertKind = "network" | "input" | "correction" | "frame" | "server" | "reconnect";
export type DiagnosticSeverity = "normal" | "warning" | "critical";

export interface NetworkDiagnosticSummary {
  effectiveType: string | null;
  downlinkMbps: number | null;
  estimatedRttMs: number | null;
  saveData: boolean | null;
}

export interface ClientDiagnosticSample {
  schemaVersion: 1;
  matchId: string;
  sampledAt: number;
  rttMs: number | null;
  inputAckP50Ms: number | null;
  inputAckP95Ms: number | null;
  inputAckMaxMs: number | null;
  frameP50Ms: number | null;
  frameP95Ms: number | null;
  frameMaxMs: number | null;
  correctionP95Px: number | null;
  correctionMaxPx: number | null;
  hardCorrections: number;
  stalls: number;
  pendingInputs: number;
  reconnects: number;
  connected: boolean;
  network: NetworkDiagnosticSummary;
}
```

Also define `DeviceDiagnosticProfile`, `ServerDiagnosticSample`, `HostDiagnosticPlayer`, `HostDiagnosticsSnapshot`, `DiagnosticReport`, and `DiagnosticReportEnvelope`. Keep strings at 128 characters or fewer and numeric metrics between `0` and `60_000`.

Add these protocol events:

```ts
// ClientToServerEvents
diagnosticsProfile: (profile: DeviceDiagnosticProfile) => void;
diagnosticsSample: (sample: ClientDiagnosticSample) => void;
diagnosticsPing: (sentAt: number, acknowledge: (sentAt: number) => void) => void;
subscribeHostDiagnostics: (payload: { token: string }, acknowledge: (result: Ack) => void) => void;

// ServerToClientEvents
diagnosticsSession: (session: { matchId: string | null }) => void;
hostDiagnostics: (snapshot: HostDiagnosticsSnapshot) => void;
diagnosticReport: (report: DiagnosticReport) => void;
```

`diagnosticsSession` is emitted only when a match starts, ends or resets. It gives player clients the opaque current `matchId` without adding diagnostic fields to the 30Hz `gameState` snapshot.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm.cmd test -- tests/diagnostics-contract.test.ts --run && npm.cmd run typecheck`

Expected: contract tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/diagnostics.ts src/shared/protocol.ts tests/diagnostics-contract.test.ts
git commit -m "feat: define host diagnostics protocol"
```

## Task 2: Client Window Aggregation and Input Acknowledgement Timing

**Files:**
- Create: `src/client/diagnostics-collector.ts`
- Create: `tests/diagnostics-collector.test.ts`

- [ ] **Step 1: Write failing collector tests**

```ts
import { describe, expect, it } from "vitest";
import { ClientDiagnosticsCollector } from "../src/client/diagnostics-collector";

describe("client diagnostics collector", () => {
  it("aggregates a one-second window and clears it after flush", () => {
    const collector = new ClientDiagnosticsCollector(() => "match-1");
    [16, 17, 55].forEach((value) => collector.recordFrame(value));
    [2, 8, 40].forEach((value) => collector.recordCorrection(value, value > 80));
    collector.recordInputSent(10, 100);
    collector.recordInputSent(11, 150);
    collector.acknowledgeInputs(11, 250);
    collector.setRtt(42);

    expect(collector.flush(1_000)).toMatchObject({
      matchId: "match-1",
      rttMs: 42,
      inputAckP50Ms: 100,
      inputAckP95Ms: 150,
      frameMaxMs: 55,
      correctionMaxPx: 40,
      stalls: 1,
      pendingInputs: 0,
    });
    expect(collector.flush(2_000)).toMatchObject({ frameMaxMs: null, inputAckP95Ms: null });
  });

  it("keeps pending input history bounded at 240 entries", () => {
    const collector = new ClientDiagnosticsCollector(() => "match-1");
    for (let seq = 1; seq <= 300; seq += 1) collector.recordInputSent(seq, seq);
    expect(collector.pendingInputCount).toBe(240);
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/diagnostics-collector.test.ts --run`

Expected: FAIL because the collector does not exist.

- [ ] **Step 3: Implement bounded aggregation**

Implement `ClientDiagnosticsCollector` with these public methods:

```ts
recordFrame(deltaMs: number): void;
recordCorrection(distancePx: number, hard: boolean): void;
recordInputSent(seq: number, atMs: number): void;
acknowledgeInputs(lastProcessedInput: number, atMs: number): void;
setRtt(rttMs: number | null): void;
setConnected(connected: boolean): void;
recordReconnect(): void;
setNetwork(summary: NetworkDiagnosticSummary): void;
flush(sampledAt: number): ClientDiagnosticSample | null;
get pendingInputCount(): number;
```

Use nearest-rank percentiles, discard non-finite values, count `deltaMs > 50` as a stall, and return `null` when there is no active match ID.

- [ ] **Step 4: Run collector and contract tests**

Run: `npm.cmd test -- tests/diagnostics-collector.test.ts tests/diagnostics-contract.test.ts --run`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/client/diagnostics-collector.ts tests/diagnostics-collector.test.ts
git commit -m "feat: aggregate client diagnostics"
```

## Task 3: Renderer and Input Integration

**Files:**
- Modify: `src/client/input-reconciliation.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `tests/input-reconciliation.test.ts`
- Create: `tests/diagnostics-integration.test.ts`

- [ ] **Step 1: Add failing observation tests**

Extend the reconciler API test:

```ts
it("reports every reconciliation distance through the observer", () => {
  const observed: Array<{ distance: number; hard: boolean }> = [];
  const reconciler = new InputReconciler("reactor-core", (distance, hard) => observed.push({ distance, hard }));
  reconciler.reconcile(player({ x: 300, y: 300 }));
  reconciler.reconcile(player({ x: 450, y: 300 }));
  expect(observed.at(-1)).toEqual({ distance: 150, hard: true });
});
```

Add a source-contract test proving `MobileApp` records sent inputs and acknowledged input sequence, and `ArenaScene.update()` records real frame delta without altering rendering quality settings.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/input-reconciliation.test.ts tests/diagnostics-integration.test.ts --run`

Expected: FAIL because the observer and integration are absent.

- [ ] **Step 3: Add narrow observation hooks**

Change the reconciler constructor to:

```ts
constructor(
  private readonly mapId: MapId = "reactor-core",
  private readonly observeCorrection: (distance: number, hard: boolean) => void = () => {},
) {}
```

After calculating `correctionDistance`, call the observer once. Add `GameRenderer` constructor callbacks:

```ts
interface GameDiagnosticHooks {
  onFrame(deltaMs: number): void;
  onCorrection(distancePx: number, hard: boolean): void;
  onAuthoritativeInput(lastProcessedInput: number): void;
}
```

`ArenaScene.update()` calls `onFrame(delta)`. Snapshot reconciliation calls `onAuthoritativeInput(player.lastProcessedInput)`. `MobileApp` owns one collector, records each sent input before `sendInput`, flushes once per second, and does not add any visible player HUD.

- [ ] **Step 4: Run focused tests and render-quality guard**

Run: `npm.cmd test -- tests/input-reconciliation.test.ts tests/diagnostics-integration.test.ts tests/render-quality.test.ts tests/mobile-performance-policy.test.ts --run`

Expected: all tests PASS; quality policy remains unchanged.

- [ ] **Step 5: Commit**

```powershell
git add src/client/input-reconciliation.ts src/client/game-scene.ts src/client/mobile-app.ts tests/input-reconciliation.test.ts tests/diagnostics-integration.test.ts
git commit -m "feat: observe client input and correction health"
```

## Task 4: Device Profile and Network Address Masking

**Files:**
- Create: `src/client/device-profile.ts`
- Create: `src/server/network-address.ts`
- Create: `tests/device-profile.test.ts`
- Create: `tests/network-address.test.ts`

- [ ] **Step 1: Write failing privacy and capability tests**

```ts
it("does not invent an iPhone model from viewport dimensions", () => {
  const profile = collectDeviceProfile(fakeNavigator({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit Safari/605.1.15" }), fakeScreen(932, 430), 3);
  expect(profile.deviceModel).toBeNull();
  expect(profile.platform).toBe("iOS");
});

it.each([
  ["192.168.1.44", "192.168.1.xxx"],
  ["::ffff:192.168.1.44", "192.168.1.xxx"],
  ["127.0.0.1", "本机"],
  ["2001:db8:abcd:12::4", "2001:db8:abcd:12::/64"],
])("masks %s", (address, expected) => expect(maskNetworkAddress(address)).toBe(expected));
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/device-profile.test.ts tests/network-address.test.ts --run`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement conservative profile collection and masking**

Parse only browser family, browser major version and broad OS platform. Read `navigator.userAgentData?.model` only when the browser provides it; otherwise return `null`. Read `navigator.connection` through a guarded structural type and return null fields when absent.

Normalize Socket.IO remote addresses before masking. Never return the original address from `maskNetworkAddress`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm.cmd test -- tests/device-profile.test.ts tests/network-address.test.ts --run && npm.cmd run typecheck`

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/client/device-profile.ts src/server/network-address.ts tests/device-profile.test.ts tests/network-address.test.ts
git commit -m "feat: collect privacy-bounded device diagnostics"
```

## Task 5: Diagnostic Network Client and RTT Ping

**Files:**
- Modify: `src/client/network.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `tests/network.test.ts`
- Create: `tests/diagnostics-network-client.test.ts`

- [ ] **Step 1: Write failing network-client tests**

Test that `sendDiagnosticsSample()` uses volatile emission, profile sends once per connected session, ping measures local elapsed time, and host diagnostics/report events update dedicated client fields without changing `room` or `game`.

```ts
expect(volatileEmit).toHaveBeenCalledWith("diagnosticsSample", sample);
expect(await client.measureDiagnosticsRtt(() => 145, 100)).toBe(45);
expect(client.hostDiagnostics).toEqual(snapshot);
expect(client.latestDiagnosticReport).toEqual(report);
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/diagnostics-network-client.test.ts --run`

Expected: FAIL because diagnostic client methods do not exist.

- [ ] **Step 3: Implement isolated client methods**

Add:

```ts
sendDiagnosticsProfile(profile: DeviceDiagnosticProfile): void;
sendDiagnosticsSample(sample: ClientDiagnosticSample): void;
measureDiagnosticsRtt(now: () => number = performance.now.bind(performance), timeoutMs = 750): Promise<number | null>;
subscribeHostDiagnostics(token: string): Promise<Ack>;
diagnosticsMatchId: string | null;
hostDiagnostics: HostDiagnosticsSnapshot | null;
latestDiagnosticReport: DiagnosticReport | null;
```

Store `diagnosticsSession` transitions in `diagnosticsMatchId`, and reset it when the server announces `null`. Reset host diagnostic subscription state on disconnect. Do not alter snapshot mode in response to diagnostic data.

- [ ] **Step 4: Run network tests**

Run: `npm.cmd test -- tests/diagnostics-network-client.test.ts tests/network.test.ts --run`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/client/network.ts src/client/mobile-app.ts tests/network.test.ts tests/diagnostics-network-client.test.ts
git commit -m "feat: transport client diagnostics"
```

## Task 6: Server Diagnostic Session and Report Finalization

**Files:**
- Create: `src/server/diagnostics-session.ts`
- Create: `tests/diagnostics-session.test.ts`
- Modify: `src/server/performance.ts`

- [ ] **Step 1: Write failing session tests**

Cover creation, player aliases, sample replacement, same-second alert deduplication, report end reasons and server report replacement:

```ts
const session = new DiagnosticsSession();
session.start({ matchId: "m1", mapId: "crystal-ruins", matchMode: "team3v3", startedAt: 1_000, players: [{ playerId: "secret-id", address: "192.168.1.xxx" }] });
session.acceptClientSample("secret-id", sample({ matchId: "m1", rttMs: 140 }), 1_500);
session.acceptClientSample("secret-id", sample({ matchId: "m1", rttMs: 160 }), 1_700);
const report = session.finish(9_000, "normal");
expect(report.players[0]).toMatchObject({ alias: "P1", address: "192.168.1.xxx", alertCounts: { network: 1 } });
expect(JSON.stringify(report)).not.toContain("secret-id");
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/diagnostics-session.test.ts --run`

Expected: FAIL because the session does not exist.

- [ ] **Step 3: Implement current-match-only storage**

Expose:

```ts
start(input: DiagnosticsMatchStart): void;
setProfile(playerId: string, profile: DeviceDiagnosticProfile, maskedAddress: string): boolean;
acceptClientSample(playerId: string, sample: ClientDiagnosticSample, receivedAt: number): boolean;
recordServerSample(sample: ServerDiagnosticSample): void;
recordDisconnect(playerId: string, at: number): void;
recordReconnect(playerId: string, at: number): void;
snapshot(now: number): HostDiagnosticsSnapshot;
finish(finishedAt: number, reason: DiagnosticEndReason): DiagnosticReport | null;
get latestReport(): DiagnosticReport | null;
```

Add `RollingMetric.clear()` so each server one-second window can reset without allocating another metric object.

- [ ] **Step 4: Run session and performance tests**

Run: `npm.cmd test -- tests/diagnostics-session.test.ts tests/performance.test.ts --run`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/server/diagnostics-session.ts src/server/performance.ts tests/diagnostics-session.test.ts tests/performance.test.ts
git commit -m "feat: aggregate current match diagnostics"
```

## Task 7: Server Event Validation, Host Authorization and Lifecycle

**Files:**
- Modify: `src/server/network.ts`
- Modify: `src/server/host-admin.ts`
- Modify: `src/server/fixed-loop.ts`
- Modify: `src/server/room.ts`
- Modify: `tests/network.test.ts`
- Modify: `tests/host-admin.test.ts`
- Modify: `tests/fixed-loop.test.ts`
- Create: `tests/diagnostics-authorization.test.ts`

- [ ] **Step 1: Write failing authorization and lifecycle tests**

Add integration coverage for:

```ts
expect(await subscribe(playerClient, "test-host-token")).toMatchObject({ ok: false });
expect(await subscribe(loopbackHostClient, "wrong")).toMatchObject({ ok: false });
expect(await subscribe(loopbackHostClient, "test-host-token")).toEqual({ ok: true });

playerClient.emit("diagnosticsSample", validSample);
await expect(hostSnapshot).resolves.toMatchObject({ players: [expect.objectContaining({ rttMs: 40 })] });
expect(playerReceivedDiagnostics).toBe(false);
```

Also assert wrong match IDs, `NaN`, payloads over limits and events faster than 750ms are discarded; force-end and reset generate reports with correct reasons.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/diagnostics-authorization.test.ts tests/network.test.ts tests/fixed-loop.test.ts --run`

Expected: diagnostic tests FAIL while existing network tests remain green.

- [ ] **Step 3: Integrate server diagnostics**

Extract a reusable `authorizeHostAccess(remoteAddress, token)` function in `host-admin.ts`; both `HostAdminService.authorize()` and diagnostic subscription call it so the loopback/token rules cannot drift. Extend `SocketData` with `lastDiagnosticsAt` and `hostDiagnosticsAuthorized`. Put authorized sockets in room `host-diagnostics`.

Use `room.gameSnapshot()?.mapId`, `room.snapshot().matchMode` and current human players to start the diagnostics session. Emit real-time snapshots at most once per second:

```ts
io.to("host-diagnostics").emit("hostDiagnostics", diagnostics.snapshot(Date.now()));
```

On match start emit `diagnosticsSession: { matchId }` to player clients. On finish/reset emit `{ matchId: null }` plus `diagnosticReport` once. When an authorized host subscribes, immediately send the current snapshot and the latest completed report if either exists. Add fixed-loop catch-up-limit reporting without changing its cap of three steps.

- [ ] **Step 4: Run server integration tests**

Run: `npm.cmd test -- tests/diagnostics-authorization.test.ts tests/network.test.ts tests/host-admin.test.ts tests/fixed-loop.test.ts tests/room.test.ts --run`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/server/network.ts src/server/host-admin.ts src/server/fixed-loop.ts src/server/room.ts tests/diagnostics-authorization.test.ts tests/network.test.ts tests/host-admin.test.ts tests/fixed-loop.test.ts
git commit -m "feat: secure host diagnostic stream"
```

## Task 8: Report Storage, Sanitization and JSON Export

**Files:**
- Create: `src/client/diagnostics-report-store.ts`
- Create: `tests/diagnostics-report-store.test.ts`

- [ ] **Step 1: Write failing retention and privacy tests**

```ts
it("keeps only the newest ten valid reports", () => {
  const storage = memoryStorage();
  const store = new DiagnosticsReportStore(storage);
  for (let index = 1; index <= 12; index += 1) store.save(report({ matchId: `m${index}`, finishedAt: index }));
  expect(store.list().map((item) => item.matchId)).toEqual(["m12", "m11", "m10", "m9", "m8", "m7", "m6", "m5", "m4", "m3"]);
});

it("exports no names, tokens or raw addresses", () => {
  const json = serializeDiagnosticReports([report()]);
  expect(json).not.toContain("nickname");
  expect(json).not.toContain("token");
  expect(json).not.toContain("192.168.1.44");
});
```

Test corrupt stored JSON and quota failure with one eviction retry.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/diagnostics-report-store.test.ts --run`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement versioned storage and export**

Use `energy-brawl.diagnostics-reports.v1`. Validate every report through the shared validator before storing. Add:

```ts
save(report: DiagnosticReport): { persisted: boolean; reports: DiagnosticReport[] };
list(): DiagnosticReport[];
remove(matchId: string): void;
clear(): void;
serialize(matchIds?: readonly string[]): string;
download(matchIds?: readonly string[]): void;
```

The download method creates and revokes an object URL. Keep Blob/browser code behind injectable dependencies so serialization tests run in Node.

- [ ] **Step 4: Run report-store tests**

Run: `npm.cmd test -- tests/diagnostics-report-store.test.ts --run`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/client/diagnostics-report-store.ts tests/diagnostics-report-store.test.ts
git commit -m "feat: retain sanitized diagnostic reports"
```

## Task 9: Host Diagnostics View and Responsive Layout

**Files:**
- Create: `src/client/host-diagnostics-view.ts`
- Create: `tests/host-diagnostics-view.test.ts`
- Modify: `src/client/host-app.ts`
- Modify: `src/client/styles.css`
- Modify: `tests/host-layout.test.ts`
- Modify: `tests/host-state.test.ts`

- [ ] **Step 1: Write failing presentation tests**

Test severity, unsupported values, AI rows, revision stability and privacy:

```ts
expect(resolveDiagnosticsPresentation(snapshot).players[0]).toMatchObject({
  playerLabel: "碰撞测试",
  rtt: "140ms",
  severity: "warning",
});
expect(renderDiagnosticsPlayers(snapshot)).toContain("192.168.1.xxx");
expect(renderDiagnosticsPlayers(snapshot)).not.toContain("192.168.1.44");
expect(renderDiagnosticsPlayers(null)).toContain("暂无对局诊断数据");
```

Extend layout contracts to require a full-width collapsible section below `.host-main`, a red alert badge, and a locally scrollable table at widths below 900px.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/host-diagnostics-view.test.ts tests/host-layout.test.ts tests/host-state.test.ts --run`

Expected: FAIL because the view and markup are absent.

- [ ] **Step 3: Implement the host-only panel**

Add to `hostTemplate()` after `.host-main`:

```html
<section class="host-diagnostics" data-diagnostics-root>
  <button class="host-diagnostics-toggle" type="button" aria-expanded="false" data-diagnostics-toggle>
    <span>性能诊断</span><b data-diagnostics-status>等待对局</b><i data-diagnostics-alerts>0</i>
  </button>
  <div class="host-diagnostics-body" hidden data-diagnostics-body>
    <div data-diagnostics-server></div>
    <div class="host-diagnostics-table-wrap"><table data-diagnostics-players></table></div>
    <div data-diagnostics-reports></div>
  </div>
</section>
```

`HostApp` subscribes after obtaining the token, saves each new completed report exactly once, updates this panel at most once per second, and binds export/delete/clear commands. Use normal table density and 8px or smaller radii consistent with the existing host UI.

- [ ] **Step 4: Run host tests and typecheck**

Run: `npm.cmd test -- tests/host-diagnostics-view.test.ts tests/host-layout.test.ts tests/host-state.test.ts --run && npm.cmd run typecheck`

Expected: all tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/client/host-diagnostics-view.ts src/client/host-app.ts src/client/styles.css tests/host-diagnostics-view.test.ts tests/host-layout.test.ts tests/host-state.test.ts
git commit -m "feat: add host diagnostics console"
```

## Task 10: Simulated Network Conditions and Three-Map Regression

**Files:**
- Create: `src/client/network-diagnostics-model.ts`
- Create: `tests/network-diagnostics-model.test.ts`
- Modify: `tests/prediction.test.ts`
- Modify: `tests/input-reconciliation.test.ts`
- Modify: `tests/v4-load-test.test.ts`

- [ ] **Step 1: Add failing classification and map-path tests**

Use deterministic timelines rather than real sleeps:

```ts
it.each([
  [{ rttMs: 40, inputAckP95Ms: 55 }, "normal"],
  [{ rttMs: 130, inputAckP95Ms: 80 }, "network"],
  [{ rttMs: 40, inputAckP95Ms: 180 }, "input"],
])("classifies %o as %s", (metrics, expected) => expect(diagnosePlayerHealth(metrics)).toBe(expected));
```

For every map, replay keyboard-like cardinal input, diagonal input and touch-like fractional stick input against the first representative horizontal and vertical wall. Assert predicted positions remain wall-safe and reconciliation correction stays below 30px when the server uses the same input sequence.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/network-diagnostics-model.test.ts tests/prediction.test.ts tests/input-reconciliation.test.ts --run`

Expected: model tests FAIL; new map cases expose any missing helper behavior.

- [ ] **Step 3: Implement deterministic diagnosis helpers**

Keep the helper pure and UI-independent. It should choose the highest-priority cause in this order: disconnected/reconnect, server, frame, correction, input, network, normal. Do not modify movement or collision code merely to satisfy diagnostics tests.

- [ ] **Step 4: Run three-map regression and load tests**

Run: `npm.cmd test -- tests/network-diagnostics-model.test.ts tests/prediction.test.ts tests/input-reconciliation.test.ts tests/v4-load-test.test.ts --run`

Expected: all tests PASS and all map load reports have `wallViolations: 0`.

- [ ] **Step 5: Commit**

```powershell
git add src/client/network-diagnostics-model.ts tests/network-diagnostics-model.test.ts tests/prediction.test.ts tests/input-reconciliation.test.ts tests/v4-load-test.test.ts
git commit -m "test: cover diagnostic causes across all maps"
```

## Task 11: Six-Client Diagnostics Pressure Test

**Files:**
- Create: `scripts/diagnostics-load-test.ts`
- Create: `tests/diagnostics-load-test.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing report validation test**

```ts
it("keeps six one-hertz diagnostic clients within budget", async () => {
  const report = await runDiagnosticsLoadTest({ simulatedSeconds: 60, clients: 6 });
  expect(validateDiagnosticsLoadReport(report)).toEqual([]);
  expect(report.acceptedSamples).toBe(360);
  expect(report.rejectedSamples).toBe(0);
  expect(report.hostSnapshots).toBeGreaterThanOrEqual(59);
  expect(report.aggregateP95Ms).toBeLessThan(1);
  expect(report.maxSerializedSampleBytes).toBeLessThan(2_048);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/diagnostics-load-test.test.ts --run`

Expected: FAIL because the load-test module does not exist.

- [ ] **Step 3: Implement the diagnostic pressure harness**

Run six Socket.IO clients against an in-process server, join and start a match, send one sample per player per simulated second, subscribe one authorized host, and measure server aggregation separately from transport setup. Include invalid/over-frequency probes in a separate test and prove they are rejected without disconnecting players.

Add:

```json
"load-test:diagnostics": "tsx scripts/diagnostics-load-test.ts"
```

- [ ] **Step 4: Run both pressure suites**

Run: `npm.cmd run load-test:v4 && npm.cmd run load-test:diagnostics`

Expected: nine existing map/mode reports retain zero wall violations; diagnostics report meets all budgets.

- [ ] **Step 5: Commit**

```powershell
git add scripts/diagnostics-load-test.ts tests/diagnostics-load-test.test.ts package.json package-lock.json
git commit -m "test: add six-client diagnostics load gate"
```

## Task 12: Release Metadata, Full Verification and Browser QA

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `scripts/clean-clone-smoke.ts` only if it asserts the version or script inventory
- Test: all `tests/*.test.ts`

- [ ] **Step 1: Update release metadata and documentation**

Set package version to `4.3.2`. Add a README section explaining:

- host-only real-time diagnostics and ten-report history;
- fixed alert thresholds;
- device/network capability limitations;
- masked addresses and anonymized JSON exports;
- `npm run load-test:diagnostics` usage;
- no automatic quality, effect, DPR or snapshot-frequency reduction.

Add the same behavior and the previous client-map collision fix to `CHANGELOG.md`.

- [ ] **Step 2: Run complete automated verification**

Run:

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run load-test:v4
npm.cmd run load-test:diagnostics
npm.cmd run smoke:maps
npm.cmd run smoke:clean-clone
git diff --check
```

Expected: every command exits 0, all nine map/mode simulations report zero wall violations, and diagnostic budgets pass.

- [ ] **Step 3: Run desktop browser QA**

Start an isolated current-build server on an unused port. In the Browser plugin test this flow:

1. Open the player page and loopback host console.
2. Join one player, ready, select each map and start a match.
3. Verify the diagnostics section is collapsed by default.
4. Expand it and verify one player row, server row, masked address and unsupported fields.
5. Trigger a controlled delayed diagnostic sample and verify the warning badge.
6. End the match, verify one report, export JSON and inspect that it has aliases but no nickname/token/raw address.
7. Repeat at `2048x1208` and `1024x800`; confirm the page has no horizontal overflow and console has no errors/warnings.

- [ ] **Step 4: Run mobile-path browser QA**

Use `932x430`, one Android landscape size and one iPad landscape size:

1. Join and play on all three maps.
2. Exercise touch movement, attack and displacement-skill controls.
3. Confirm no diagnostic panel or metric appears in the player DOM/HUD.
4. Confirm full DPR canvas, full effects, no page overflow and no console errors.

- [ ] **Step 5: Review the release diff and commit**

Run: `git status --short && git diff --stat && git diff --check`

Expected: only v4.3.2 implementation, tests and release documentation are present.

```powershell
git add package.json package-lock.json README.md CHANGELOG.md scripts src tests
git commit -m "feat: release v4.3.2 host diagnostics"
```

- [ ] **Step 6: Push using the project naming rule after user requests release**

Create or use `codex/v4.3.2-team-skills`, fetch the remote base, verify `origin/main` is an ancestor of `HEAD`, then push without force:

```powershell
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git push -u origin HEAD:v4.3.2-team-skills
```

Do not update `main` unless the user explicitly requests it.
