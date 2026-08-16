# Energy Brawl Match Continuity And Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative map-mechanic contribution results, distinct map feedback, kill/death camera feedback, and a reliable repeated-match lobby flow while completing release-quality gates.

**Architecture:** Simulation code records contribution counters in player state and exposes them through the shared protocol. Client selectors convert authoritative snapshot edges into disposable audio, haptic, camera, and UI presentation events. Room reset and map rotation stay server-owned; the client only gates readiness until the returning player re-confirms a character.

**Tech Stack:** TypeScript, Vitest, Phaser 3, Socket.IO, Web Audio API, Vibration API, Vite.

---

### Task 1: Define Map Contribution Contract And MVP Weighting

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/shared/match-results.ts`
- Modify: `tests/match-results.test.ts`

- [ ] Add failing assertions for the five zero-default contribution counters and their published MVP weights.
- [ ] Run `npm.cmd test -- --run tests/match-results.test.ts` and verify the assertions fail because the contract and weights are absent.
- [ ] Add `MapMechanicContribution`, expose it on `PlayerSnapshot`, and add a focused `calculateMapMechanicContributionScore` helper.
- [ ] Run the focused test and keep all existing MVP tie-break behavior green.

### Task 2: Record Authoritative Contributions

**Files:**
- Modify: `src/server/map-mechanic-system.ts`
- Modify: `src/server/simulation.ts`
- Modify: `tests/map-mechanic-system.test.ts`
- Modify: `tests/simulation.test.ts`

- [ ] Add failing tests for one reactor escape per warning round, neon post-mitigation damage, crystal claims and healing, and buff-assisted eliminations.
- [ ] Run the focused tests and verify each fails for the missing counters.
- [ ] Track warning exposure and escape state per reactor round, initialize zeroed contribution objects, and update counters only inside authoritative damage/healing/mechanic paths.
- [ ] Run the focused tests and confirm duplicate ticks and repeated snapshots cannot double count.

### Task 3: Render Post-Match Mechanic Contribution

**Files:**
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Modify: `tests/tactical-hud-ui.test.ts`
- Modify: `tests/mobile-viewport.test.ts`

- [ ] Add failing UI assertions for a mechanic contribution column and compact detail text.
- [ ] Run the focused UI tests and verify they fail against the existing result table.
- [ ] Render a concise per-player summary and preserve readable horizontal behavior at 844x390, 932x430, and tablet viewports.
- [ ] Run the focused UI tests.

### Task 4: Add Distinct Map Audio And Haptic Events

**Files:**
- Create: `src/client/map-mechanic-feedback.ts`
- Create: `tests/map-mechanic-feedback.test.ts`
- Modify: `src/client/combat-audio.ts`
- Modify: `src/client/combat-haptics.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `tests/combat-audio.test.ts`
- Modify: `tests/combat-haptics.test.ts`

- [ ] Add failing tests for six distinct warning/active cues, stable event keys, duplicate suppression, bounded vibration patterns, and audio approval after unlock.
- [ ] Run the focused tests and verify missing APIs fail.
- [ ] Implement the snapshot-edge selector, procedural Web Audio profiles, vibration profiles, and CSS fallback integration.
- [ ] Run the focused tests and verify iOS audio unlock behavior remains green.

### Task 5: Add Kill And Death Camera Impulses

**Files:**
- Modify: `src/client/skill-effects.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/skill-effects.test.ts`
- Modify: `tests/combat-feedback.test.ts`

- [ ] Add a failing assertion that kill feedback has a readable but smaller impulse than death and that the renderer prioritizes death, then kill, then hurt.
- [ ] Run focused tests and verify the kill path is not currently selected by the renderer.
- [ ] Extend the impulse profile and renderer selection without changing authoritative combat state.
- [ ] Run focused tests.

### Task 6: Complete Repeated-Match Reselection Flow

**Files:**
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/host-app.ts`
- Modify: `src/client/network.ts`
- Modify: `tests/room.test.ts`
- Modify: `tests/network.test.ts`
- Modify: `tests/character-selection-ui.test.ts`
- Modify: `tests/host-layout.test.ts`

- [ ] Add failing tests that connected humans remain seated, bots are removed, readiness resets, random maps avoid the previous map, and a returning client must re-confirm a character before readying.
- [ ] Run focused tests and identify which requirements already pass through existing room behavior.
- [ ] Add only the missing client transition state and rematch labeling; retain the existing server reset and resolver when their tests already prove the behavior.
- [ ] Run focused tests and verify the opening map-mechanic banner gets a fresh match key.

### Task 7: Complete Final Gates And Soak

> Execution note (2026-08-16): the user completed real-device validation and explicitly waived repeating the 30-minute soak. Automated gates remain mandatory.

**Files:**
- Modify only if a gate exposes a reproducible defect.
- Record evidence in: `artifacts/qa/map-feedback-soak/`

- [ ] Run `npm.cmd test -- --run` and require zero failures.
- [ ] Run `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run assets:v3`, `npm.cmd run assets:v4`, and `npm.cmd run smoke:clean-clone`.
- [ ] Run `npm.cmd run doctor` and require a valid LAN URL plus `Any / TCP 3000-3010 / LocalSubnet` firewall coverage.
- [ ] Start the server, connect one real desktop browser and one real phone on the same LAN, fill remaining seats with bots, and run a 30-minute match/session soak.
- [ ] Capture desktop/mobile screenshots plus diagnostic report evidence. Pass criteria: no disconnect loop, blank report, stuck input, wall penetration, friendly fire, missing map feedback, or sustained visible hitching; record RTT, input P95, longest frame, and correction counts.
