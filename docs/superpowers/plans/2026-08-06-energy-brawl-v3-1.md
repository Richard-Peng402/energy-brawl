# Energy Brawl v3.1 Implementation Plan

> **For agentic workers:** Execute this plan inline with test-first checkpoints. Keep existing LAN fixes outside the release commit unless explicitly required.

**Goal:** Make host stat controls authoritative and visible, make skill pickups frequent and meaningful, improve character/arena rendering clarity, and smooth camera follow for v3.1.

**Architecture:** Keep the server authoritative. Host admin commands remain queued at the socket boundary, but the fixed-step loop reports whether admin state changed and emits an immediate authoritative snapshot. Skill spawning remains deterministic through the existing bag/point system with higher availability limits. Character art is normalized in the asset import pipeline and rendered with crisp, high-contrast outlines; camera behavior is isolated behind a small pure follow policy helper.

**Tech Stack:** TypeScript, Socket.IO, Phaser 3, Vite, Vitest, existing CC-BY-SA/CC0 asset pipeline.

---

### Task 1: Reproduce and fix host stat visibility

**Files:**
- Modify: `src/server/network.ts`
- Modify: `src/server/host-admin.ts`
- Modify: `src/client/host-app.ts`
- Test: `tests/network.test.ts`, `tests/host-admin.test.ts`

- [ ] Add a failing network test that queues `setStat`, advances one fixed tick, and asserts a `gameState` event contains the changed stat.
- [ ] Change `HostAdminService.drain` to return both processed count and whether a command actually changed authoritative state, preserving the existing audit log.
- [ ] Make `network.advance` broadcast a non-volatile game transition whenever admin state changes, so host and players observe the new value immediately.
- [ ] Replace the free-text stat prompt with a small structured editor that constrains stat names and values, reports the acknowledged before/after value, and refreshes after the authoritative snapshot.
- [ ] Run the focused host/network tests and confirm the new test fails before implementation and passes after it.

### Task 2: Increase skill availability without runaway power

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/server/skill-system.ts`
- Test: `tests/skill-system.test.ts`, `tests/simulation.test.ts`

- [ ] Add failing tests for two initial skill orbs, a six-orb cap, and a 4–7 second spawn interval with the existing safe-point collision rules.
- [ ] Change skill constants to `MAX_SKILL_ORBS = 6`, `SKILL_ORB_SPAWN_MIN_MS = 4_000`, `SKILL_ORB_SPAWN_MAX_MS = 7_000`.
- [ ] Seed the first two safe orbs immediately after world creation, then continue normal bag rotation and safe-point replenishment.
- [ ] Preserve one-charge pickup semantics and add a regression assertion that all four skill types rotate before a bag repeats.

### Task 3: Normalize character art and sharpen runtime rendering

**Files:**
- Modify: `scripts/import-v3-assets.mjs`
- Modify: `src/client/asset-registry.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/asset-registry.test.ts`, `tests/effect-pool.test.ts`
- Generate: normalized character assets under `public/assets/v3/characters`

- [ ] Add a failing asset-pipeline/registry assertion that combat textures are normalized single-character images rather than the original multi-unit sheet bounds.
- [ ] Update the import pipeline to crop and normalize each licensed source frame to a transparent, centered 192×192 runtime image while keeping manifest provenance and output paths unchanged.
- [ ] Render characters at a larger stable display size with crisp texture filtering, a color-coded outline/ring, clearer health bars, and stronger hit/attack state contrast.
- [ ] Add a high-resolution fallback path so a missing normalized image still renders a clean single-character SVG instead of a sheet.
- [ ] Re-run the asset validator and focused asset tests.

### Task 4: Improve arena readability and camera feel

**Files:**
- Create: `src/client/camera-follow.ts`
- Modify: `src/client/game-scene.ts`
- Test: `tests/camera-follow.test.ts`, `tests/mobile-viewport.test.ts`

- [ ] Add failing pure tests for a central camera deadzone, bounded target coordinates, and smooth follow interpolation.
- [ ] Implement the helper with a 20% horizontal / 16% vertical deadzone and frame-rate independent smoothing.
- [ ] Use the helper in Phaser instead of a fixed `startFollow(..., 0.12, 0.12)`, preserving arena bounds and slightly widening the visible playfield on mobile.
- [ ] Improve floor contrast, wall separation, energy/skill glow, and projectile readability without changing collision geometry.
- [ ] Capture desktop and mobile landscape screenshots and verify no HUD overlap or scrolling.

### Task 5: Release v3.1 and regression verification

**Files:**
- Modify: `package.json`, `package-lock.json`
- Test: full suite

- [ ] Run focused tests, then `npm.cmd test -- --run`, `npm.cmd run typecheck`, `npm.cmd run build`, and `git diff --check`.
- [ ] Start the LAN server and verify host stat changes, skill pickup visibility, camera motion, and character clarity in a browser playtest.
- [ ] Update package versions to `3.1.0` only after all checks pass.
- [ ] Commit only v3.1 implementation/release files; keep pre-existing LAN repair files separate.
