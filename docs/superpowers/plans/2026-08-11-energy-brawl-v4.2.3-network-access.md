# v4.2.3 Network Access and Clean Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make LAN address selection route-aware, keep the host QR code current after network changes, and prove a clean GitHub clone contains everything required to build and play.

**Architecture:** A focused `network-topology.ts` module owns interface classification, default-route selection, status, and revision generation. The server exposes that snapshot through uncached `/api/info`; a focused client refresh controller owns polling, cancellation, and stale-response protection, while `HostApp` only renders state. A doctor script and two-platform GitHub Actions job validate clean installation without depending on developer-only folders.

**Tech Stack:** TypeScript, Node.js 22, Express, Socket.IO, Vitest, Vite, `default-gateway`, PowerShell, GitHub Actions.

---

### Task 1: Add route-aware topology tests

**Files:**
- Create: `tests/network-topology.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the runtime dependency declaration**

Add `default-gateway` to `dependencies` and run `npm.cmd install --package-lock-only` so the lockfile records the exact dependency graph.

- [ ] **Step 2: Write the failing topology tests**

Cover these concrete cases:

```ts
const snapshot = await discoverNetworkSnapshot({
  port: 3000,
  interfaces: {
    "vEthernet (Default Switch)": [address("10.176.20.53")],
    WLAN: [address("192.168.123.17")],
    "WLAN 4": [address("192.168.137.1")],
  },
  defaultGateway: { interface: "WLAN", gateway: "192.168.123.1" },
});
expect(snapshot.primaryUrl).toBe("http://192.168.123.17:3000/");
expect(snapshot.status).toBe("ready");
```

Also assert: hotspot-only becomes `hotspot-only`, no usable address becomes `unavailable` with no `primaryUrl`, non-RFC1918 physical addresses can be candidates, and changing the default-route address changes `revision`.

- [ ] **Step 3: Run the focused test and verify RED**

Run `npm.cmd test -- --run tests/network-topology.test.ts`.
Expected result: the suite fails because `src/server/network-topology.ts` and its discovery API do not exist.

### Task 2: Implement the isolated topology module

**Files:**
- Create: `src/server/network-topology.ts`
- Modify: `src/server/lan-address.ts`
- Test: `tests/network-topology.test.ts`

- [ ] **Step 1: Implement injected discovery and classification**

Define `NetworkKind`, `NetworkStatus`, `NetworkCandidate`, `NetworkSnapshot`, and `discoverNetworkSnapshot(input)` as specified in the design document. Use the injected default-route interface before interface-name heuristics. Exclude loopback, link-local, unspecified, and virtual interfaces from `primaryUrl`; keep virtual interfaces only in diagnostics. Generate `revision` from sorted `port`, `status`, `primaryUrl`, and candidate addresses.

- [ ] **Step 2: Add the production default-gateway adapter**

Import `v4` from `default-gateway`. Catch adapter errors and pass `null` to discovery so a missing route does not crash the server.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run `npm.cmd test -- --run tests/network-topology.test.ts tests/lan-address.test.ts`.
Expected result: all topology and existing address-order tests pass.

- [ ] **Step 4: Run typecheck**

Run `npm.cmd run typecheck` and verify exit code 0 before continuing.

### Task 3: Expose a current, uncached network snapshot from the server

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/network.ts`
- Create: `tests/network-info.test.ts`

- [ ] **Step 1: Write failing API tests**

Assert `/api/info` includes `network.primaryUrl`, `network.revision`, and `network.status`, returns `Cache-Control: no-store`, and never falls back to a phone QR for `unavailable` topology.

- [ ] **Step 2: Implement the server topology provider**

Create one server-owned provider with a short 1.5-second cache. Each `/api/info` request asks it for the current snapshot; the provider refreshes when the cache expires and keeps the last successful snapshot only for diagnostics, never as a current-ready replacement.

- [ ] **Step 3: Integrate exact allowed LAN origins**

Pass the current candidate addresses into the Socket.IO origin check without broadening public-origin access. Preserve localhost and existing safe LAN ranges.

- [ ] **Step 4: Run focused API tests**

Run `npm.cmd test -- --run tests/network-info.test.ts tests/network.test.ts` and verify GREEN.

### Task 4: Add race-safe host QR refresh

**Files:**
- Create: `src/client/server-info-refresh.ts`
- Modify: `src/client/host-app.ts`
- Create: `tests/server-info-refresh.test.ts`

- [ ] **Step 1: Write failing controller tests**

Use injected `fetchInfo`, timer callbacks, and event targets. Assert initial fetch, 3-second polling, immediate `online`/`focus`/visibility refresh, cancellation or sequence protection for an older slower response, no QR replacement for equal revisions, and stale status after fetch failure.

- [ ] **Step 2: Implement `ServerInfoRefreshController`**

Expose `start()`, `stop()`, and `subscribe(listener)`. Use one `AbortController` per request, a monotonic sequence, `cache: "no-store"`, and a 3-second timer. Keep DOM concerns out of this module.

- [ ] **Step 3: Integrate the controller into `HostApp`**

Replace one-shot `loadInfo()` with controller subscription. Render `network.status`, `network.kind`, `network.checkedAt`, `network.primaryUrl`, and stale warnings. Update `#join-url` and `#join-qr` atomically when `revision` changes. Stop the controller on app teardown if the host shell is removed.

- [ ] **Step 4: Run focused client tests**

Run `npm.cmd test -- --run tests/server-info-refresh.test.ts tests/host-state.test.ts tests/host-console-url.test.ts` and verify GREEN.

### Task 5: Make firewall setup network-profile agnostic but subnet-limited

**Files:**
- Modify: `scripts/setup-lan-firewall.ps1`
- Create: `tests/firewall-script.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing script contract tests**

Read the script as text and assert it contains `-Profile Any`, `-RemoteAddress LocalSubnet`, `-Protocol TCP`, and `-LocalPort "3000-3010"`; assert it does not contain an unrestricted `RemoteAddress Any` rule.

- [ ] **Step 2: Update the script**

Use `Profile Any` while retaining `LocalSubnet`. Keep administrator requirement and idempotent update behavior.

- [ ] **Step 3: Document the security boundary**

Explain that this supports Public/Private Windows profiles but still limits inbound traffic to the local subnet; document AP isolation as a router-side limitation.

- [ ] **Step 4: Run the script contract test**

Run `npm.cmd test -- --run tests/firewall-script.test.ts` and verify GREEN. Do not change or delete unrelated firewall rules.

### Task 6: Add clean-install doctor and package scripts

**Files:**
- Create: `scripts/release-doctor.ts`
- Create: `tests/release-doctor.test.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write failing doctor tests**

Test pure functions for Node major version validation, runtime asset manifest completeness, valid package/lock version equality, and actionable diagnostics for a missing firewall rule or unavailable network snapshot.

- [ ] **Step 2: Implement pure checks and CLI**

Keep checks in exported pure functions. The CLI runs asset validation, package metadata checks, `discoverNetworkSnapshot`, and platform-specific firewall inspection; it exits 0 only when build prerequisites are present and emits one repair instruction per failure.

- [ ] **Step 3: Add `npm run doctor`**

Point the package script at `tsx scripts/release-doctor.ts`. Do not make normal `npm run server` depend on doctor success, so developers can still diagnose a partially configured network.

- [ ] **Step 4: Run focused doctor tests**

Run `npm.cmd test -- --run tests/release-doctor.test.ts` and `npm.cmd run doctor` on the current machine.

### Task 7: Add clean-clone GitHub Actions coverage

**Files:**
- Create: `.github/workflows/clean-clone.yml`
- Modify: `README.md`

- [ ] **Step 1: Add a two-OS matrix job**

Use `windows-latest` and `ubuntu-latest`, Node 22, checkout without project caches, `npm ci`, asset validation, full tests, typecheck, build, and a localhost `/api/info` smoke request.

- [ ] **Step 2: Add tracked-runtime-asset assertions**

Fail the job if any manifest entry points outside `public/assets/v3` or if any referenced file is missing. Keep `dist`, `node_modules`, and coverage as generated-only outputs.

- [ ] **Step 3: Validate workflow syntax locally**

Run `git diff --check` and inspect the workflow commands for Windows PowerShell and Ubuntu shell differences before committing.

### Task 8: Version, documentation, and release acceptance

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/server/index.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-08-11-energy-brawl-v4.2.3-network-access-design.md`

- [ ] **Step 1: Update version to 4.2.3**

Keep package, lockfile, server API response, README, and changelog consistent.

- [ ] **Step 2: Add clean-computer instructions**

Document `npm ci`, `npm run doctor`, build, firewall setup, same-LAN requirements, QR refresh behavior, and the exact AP-isolation limitation.

- [ ] **Step 3: Run full release verification**

Run:

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run assets:v3
npm.cmd run assets:v4
npm.cmd run build
npm.cmd run doctor
npm.cmd run load-test:v4
git diff --check
```

Expected: all tests pass, typecheck/build/asset checks/doctor exit 0, load test reports zero wall violations, and `git diff --check` has no errors.

- [ ] **Step 4: Commit and push**

Create local branch `codex/v4.2.3-team-skills`, commit the implementation, and push only to remote `v4.2.3-team-skills` through the configured GitHub relay. Do not force-push or update `main`.

## Self-review

- The design requirement for route-aware selection is covered by Tasks 1-3.
- QR refresh, stale-response protection, and no-cache headers are covered by Tasks 3-4.
- Public/Private profile handling and subnet restriction are covered by Task 5.
- Clean clone, runtime asset completeness, and cross-OS startup are covered by Tasks 6-7.
- Versioning and final acceptance are covered by Task 8.
- No task requires absolute paths from the developer machine; all runtime assets are repository-relative.
