# Energy Brawl v3.0 Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the final v3.0 release with reliable host overrides, a coherent sci-fi arena skin, tapered projectile trails, precise straight-line aiming, a 20-point target, and an all-player kill feed.

**Architecture:** Keep the server authoritative for player tuning, winner transitions, scoring, and kill events. Phaser remains responsible for the arena skin, projectile pool, and aim line; the DOM HUD renders the kill feed and host controls. Existing terrain geometry and fixed-capacity effect pools remain unchanged.

**Tech Stack:** TypeScript, Phaser 3, Socket.IO, Vite, Vitest, HTML/CSS.

---

### Task 1: Host override authority and editable stats

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/host-admin.ts`
- Modify: `src/server/room.ts`
- Modify: `src/server/simulation.ts`
- Modify: `src/server/network.ts`
- Modify: `src/client/host-app.ts`
- Test: `tests/host-admin.test.ts`
- Test: `tests/room.test.ts`
- Test: `tests/network.test.ts`

- [ ] **Step 1: Write failing tests** for `projectileSpeed`, `kills`, and `energyCollected` lobby/live changes and token-authorized host access through a private-LAN address.
- [ ] **Step 2: Run tests and confirm RED** because the new stats are rejected and private-LAN host calls are denied.
- [ ] **Step 3: Extend `AdminStat` and authoritative world/seat updates** so lobby settings seed the match and live settings update the next broadcast snapshot.
- [ ] **Step 4: Make the random host token the authority boundary** so opening the printed host URL through the PC's LAN interface does not silently reject commands.
- [ ] **Step 5: Render all editable values in the host stat dialog and roster**, including projectile speed, kills, and collected energy.
- [ ] **Step 6: Run focused tests and confirm GREEN.**

### Task 2: Reliable forced winner transition

**Files:**
- Modify: `src/server/room.ts`
- Modify: `src/client/host-app.ts`
- Test: `tests/room.test.ts`
- Test: `tests/network.test.ts`

- [ ] **Step 1: Write a failing regression test** that presets a lobby winner, starts the match, and verifies the authoritative finished snapshot is broadcast immediately with that exact winner ID.
- [ ] **Step 2: Run the regression test and confirm RED** against the failing access path reproduced in Task 1.
- [ ] **Step 3: Keep `forceWorldWinner()` as the only match-finishing path**, clear projectiles, set `finishedAt`, and schedule lobby return.
- [ ] **Step 4: Give the host UI explicit success text** for preset and live forced wins so failure is no longer visually ambiguous.
- [ ] **Step 5: Run room and network tests and confirm GREEN.**

### Task 3: Sci-fi arena skin and tapered projectile trail

**Files:**
- Modify: `public/assets/v3/arena/*`
- Modify: `public/assets/v3/fx/projectiles/projectile-trace.png`
- Modify: `public/assets/v3/manifest.json`
- Modify: `scripts/import-v3-assets.mjs`
- Modify: `src/client/asset-registry.ts`
- Modify: `src/client/game-scene.ts`
- Test: `tests/asset-registry.test.ts`

- [ ] **Step 1: Add failing asset-registry assertions** for the CC0 Sci-Fi RTS source and the projectile trail asset.
- [ ] **Step 2: Run the asset test and confirm RED.**
- [ ] **Step 3: Import a dark sci-fi floor derived from the approved terrain texture**, metallic wall modules and beacons from Kenney Sci-Fi RTS, and the tapered `flame_05` particle from Kenney Particle Pack.
- [ ] **Step 4: Remove the rectangular projectile tail object** and render the tapered texture in the existing fixed projectile/effect pools.
- [ ] **Step 5: Retheme arena colors to dark cobalt, steel, cyan, and amber without changing `WALLS`, spawns, or collision geometry.**
- [ ] **Step 6: Regenerate the manifest and confirm the asset test is GREEN.**

### Task 4: Precise straight-line aim indicator

**Files:**
- Modify: `src/client/game-scene.ts`
- Modify: `tests/aim-guide.test.ts`

- [ ] **Step 1: Add a failing presentation assertion** for a narrow straight indicator using the existing wall-clipped aim length.
- [ ] **Step 2: Run the focused test and confirm RED.**
- [ ] **Step 3: Replace the 64-pixel corridor with a 7-pixel straight beam and compact endpoint**, preserving `calculateAimGuide()` collision precision.
- [ ] **Step 4: Run the aim tests and confirm GREEN.**

### Task 5: Twenty-point target and global kill feed

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/simulation.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/simulation.test.ts`
- Test: `tests/render-throttle.test.ts`

- [ ] **Step 1: Write failing tests** proving the hold condition starts at 20 rather than 15 and lethal damage appends one bounded kill-feed event with killer/victim IDs.
- [ ] **Step 2: Run focused tests and confirm RED.**
- [ ] **Step 3: Set `TARGET_SCORE` to 20 and add a bounded server kill-feed list** included in snapshots.
- [ ] **Step 4: Render the newest three events as a compact all-player DOM overlay** below the match clock with names, colors, and short entry motion.
- [ ] **Step 5: Run focused tests and confirm GREEN.**

### Task 6: Release and verification

**Files:**
- Modify: `package.json`
- Modify: `src/server/index.ts` only if version text is sourced there

- [ ] **Step 1: Set the displayed release label to the final v3.0 build.**
- [ ] **Step 2: Run `npm.cmd test -- --run` and require zero failures.**
- [ ] **Step 3: Run `npm.cmd run typecheck` and require exit code 0.**
- [ ] **Step 4: Run `npm.cmd run build` and require exit code 0.**
- [ ] **Step 5: Browser-test desktop and 844×390 landscape:** join, ready, start, fire, view the straight aim line, view the tapered trail, force a winner, and confirm no console errors.
- [ ] **Step 6: Run the six-client 60-second load test and require two starts, full admin coverage, and zero wall violations.**
