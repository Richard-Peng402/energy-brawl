# Energy Brawl v4.4.0 Tactical HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visibility-safe tactical radar, off-screen direction cues, and authoritative MVP results presentation.

**Architecture:** Pure shared/result and client/geometry modules keep rules testable. Existing snapshots carry two final-result fields; the mobile app renders a reusable canvas and DOM cues without adding network traffic.

**Tech Stack:** TypeScript, Phaser 3, Socket.IO, DOM Canvas, Vitest, Vite, browser visual QA.

---

### Task 1: Authoritative MVP contract

**Files:**
- Create: `src/shared/match-results.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/simulation.ts`
- Test: `tests/match-results.test.ts`
- Test: `tests/simulation.test.ts`

- [ ] Write failing tests for the weighted score, deterministic ties, normal finish, and forced winner snapshots.
- [ ] Run the focused tests and confirm failure because MVP fields/helpers do not exist.
- [ ] Implement `calculateMvpScore`, `selectMatchMvp`, and snapshot fields `matchMvpId`/`matchMvpScore`.
- [ ] Run focused tests and typecheck.

### Task 2: Radar projection and visibility

**Files:**
- Create: `src/client/tactical-radar.ts`
- Test: `tests/tactical-radar.test.ts`

- [ ] Write failing tests for map projection, wall projection, teammate markers, line-of-sight enemy filtering, orb/capture markers, and bounded marker counts.
- [ ] Run focused tests and confirm missing module failure.
- [ ] Implement pure radar frame generation using the active map catalog and existing wall collision helpers.
- [ ] Run focused tests.

### Task 3: Off-screen cue geometry and damage-source state

**Files:**
- Modify: `src/client/tactical-radar.ts`
- Modify: `src/client/game-scene.ts`
- Test: `tests/tactical-cues.test.ts`
- Test: `tests/combat-feedback.test.ts`

- [ ] Write failing tests for viewport inclusion, safe-edge clamping, cue priority/limit, and three-second damage cue expiry.
- [ ] Run focused tests and confirm failure.
- [ ] Implement cue geometry plus a small scene HUD-state callback carrying camera bounds and recent attacker id/time.
- [ ] Run focused tests.

### Task 4: Mobile HUD and results UI

**Files:**
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/tactical-hud-ui.test.ts`
- Test: `tests/mobile-layout.test.ts`

- [ ] Write failing DOM/source tests for radar canvas, cue layer, phase visibility, results columns, MVP and local-row classes.
- [ ] Run focused tests and confirm failure.
- [ ] Add the radar canvas and cue layer, reuse one drawing context, and render the expanded fixed-height results table.
- [ ] Add desktop and landscape mobile constraints that protect all control zones.
- [ ] Run focused tests and typecheck.

### Task 5: Release documentation and verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] Update all versions to `4.4.0` and document the exact MVP rule and privacy-safe radar behavior.
- [ ] Run all Vitest tests, typecheck, build, v4 load test, diagnostics load test, clean-clone smoke, and `git diff --check`.
- [ ] Start a local production server and perform desktop, iPhone landscape, and iPad landscape browser visual QA for lobby, combat, domination, death/spectator, and results states.
- [ ] Fix every functional or visual regression, repeat affected tests, then repeat the full release matrix.
- [ ] Request final code review, commit, fetch `origin/main`, merge if required without force, push `HEAD:main`, and verify local HEAD equals `origin/main`.
