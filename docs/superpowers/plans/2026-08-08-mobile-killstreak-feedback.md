# Mobile Killstreak Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the skill control to the reachable right edge, reduce the kill feed to one line, and add authoritative one-to-five-tier synthesized killstreak audio that resets on death.

**Architecture:** The authoritative simulation owns a private per-player streak counter and places the resulting tier on each `KillFeedEvent`. The mobile client renders only the newest event and plays audio only when that new event belongs to the local killer. `CombatAudio` synthesizes five deterministic Web Audio cues and clamps streaks above five to tier five.

**Tech Stack:** TypeScript, Phaser 3, Socket.IO snapshots, DOM/CSS mobile HUD, Web Audio API, Vitest, Vite.

---

## Design decisions

- Use server-authoritative streaks instead of deriving streaks from the client feed. This remains correct after packet loss, reduced snapshot rates, reconnection, and feed truncation.
- Keep `killStreak` inside `WorldPlayer`; omit it from ordinary player snapshots. Only the current streak tier needed for feedback is added to `KillFeedEvent`.
- Reset the victim's streak immediately on authoritative death. Increment the attacker's streak before creating the kill event.
- Clamp audio selection with `Math.min(5, streak)`, so six kills and above use the fifth cue.
- Render only `killFeed.at(-1)`. Keep the server's short event history for reliable delivery, but do not stack it on screen.
- Play a kill cue only when the newest unseen event has `killerId === localPlayerId` and is recent. Repeated snapshots must not replay it.
- Synthesize tones at runtime. No network fetch or large audio asset is added, and the existing iOS user-gesture unlock path remains the single audio gate.
- Place the skill button at the lower-right safe edge, above the normal aiming-thumb region. The button remains marked `data-skill-button`, so `TouchRouter` prevents the attack joystick from stealing that touch.

## File map

- Modify `src/shared/protocol.ts`: add `streak` to `KillFeedEvent`.
- Modify `src/server/simulation.ts`: maintain/reset server-authoritative streak state and omit private state from snapshots.
- Modify `src/client/combat-audio.ts`: define five synthesized cue recipes and playback.
- Modify `src/client/combat-feedback.ts`: select the latest event and gate exact-once local kill playback.
- Modify `src/client/mobile-app.ts`: show one feed row and trigger local kill audio once.
- Modify `src/client/styles.css`: relocate and compact the skill button; tune one-line feed sizing.
- Modify `tests/simulation.test.ts`: verify increment, death reset, and streak tiers above five.
- Modify `tests/combat-audio.test.ts`: verify five distinct recipes and five-tier clamping.
- Modify `tests/mobile-layout.test.ts`: verify right-edge skill placement and one-line feed behavior.

### Task 1: Server-authoritative killstreak state

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/simulation.ts`
- Test: `tests/simulation.test.ts`

- [ ] **Step 1: Write failing simulation tests**

Add assertions that consecutive kills produce event streaks `1`, `2`, and `3`; killing the attacker resets that player's private streak; the next kill after respawn produces streak `1`; and a sixth uninterrupted kill produces `streak: 6` for client-side clamping.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --run tests/simulation.test.ts`

Expected: FAIL because kill events do not contain `streak` and no private streak state exists.

- [ ] **Step 3: Implement the server state**

Use this data shape:

```ts
export interface KillFeedEvent {
  id: string;
  at: number;
  killerId: string;
  victimId: string;
  streak: number;
}

export interface WorldPlayer extends PlayerSnapshot {
  killStreak: number;
}
```

On death, set `victim.killStreak = 0`. For a non-self attacker, increment `attacker.killStreak`, then write the value into the new event. Exclude `killStreak` in `worldToSnapshot()` so it does not leak into `PlayerSnapshot`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- --run tests/simulation.test.ts`

Expected: all simulation tests pass.

### Task 2: Five synthesized kill cues

**Files:**
- Modify: `src/client/combat-audio.ts`
- Test: `tests/combat-audio.test.ts`

- [ ] **Step 1: Write failing audio recipe tests**

Test `killStreakCue(1)` through `killStreakCue(5)` for distinct tier, duration/layer count, and frequency direction. Verify `killStreakCue(6)` and `killStreakCue(99)` return tier five.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --run tests/combat-audio.test.ts`

Expected: FAIL because `killStreakCue` and the kill sound kind do not exist.

- [ ] **Step 3: Implement cue recipes and playback**

Create five deterministic recipes:

1. One kill: one high sine sweep around 880→1320 Hz plus a quiet delayed echo.
2. Double kill: two ascending electronic tones around 620→820 Hz and 820→1080 Hz.
3. Triple kill: a low 120→58 Hz triangle body plus two layered mid tones for impact.
4. Quad kill: a deep 95→42 Hz drum-like body plus a sharp 760→1450 Hz sawtooth accent.
5. Five-plus kills: a 58→30 Hz bass rumble, four-note rising electronic sequence, and a bright final peak.

Expose `playKillStreak(streak: number)` and route it through the existing mute, unlock, active-voice, and iOS AudioContext policy.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- --run tests/combat-audio.test.ts`

Expected: all audio tests pass.

### Task 3: One-line feed and exact-once local playback

**Files:**
- Modify: `src/client/combat-feedback.ts`
- Modify: `src/client/mobile-app.ts`
- Test: `tests/mobile-audio-ui.test.ts`

- [ ] **Step 1: Write failing event-selection tests**

Add a pure helper to `combat-feedback.ts` that returns the latest feed event and a local kill cue only for an unseen, recent event owned by the local player. Verify remote kills, stale events, and repeated IDs do not produce a cue.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --run tests/mobile-audio-ui.test.ts`

Expected: FAIL because the new selection helper is absent.

- [ ] **Step 3: Implement rendering and playback**

Use only `(snapshot.killFeed ?? []).at(-1)`. Render one `.kill-feed-row`, set `lastKillFeedRevision` to that event ID, and call `audio.playKillStreak(event.streak)` only for a new recent local-killer event.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- --run tests/mobile-audio-ui.test.ts`

Expected: all mobile audio UI tests pass.

### Task 4: Right-edge skill control and compact HUD

**Files:**
- Modify: `src/client/styles.css`
- Test: `tests/mobile-layout.test.ts`

- [ ] **Step 1: Write failing layout contract tests**

Verify `.skill-button` uses `right`, does not use `left: 50%`, respects `env(safe-area-inset-right)`, and its active transform no longer includes `translateX(-50%)`. Verify feed CSS is sized for a single row.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --run tests/mobile-layout.test.ts`

Expected: FAIL against the current centered button.

- [ ] **Step 3: Implement the responsive layout**

Use a recommended baseline of `right: max(16px, calc(env(safe-area-inset-right) + 10px))` and `bottom: max(104px, calc(env(safe-area-inset-bottom) + 94px))`, with a compact 82×68 px control. Preserve a minimum 60 px touch target and keep the feed centered under the match clock as one transient row.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- --run tests/mobile-layout.test.ts`

Expected: all layout tests pass.

### Task 5: Final verification

**Files:**
- Verify: all modified files

- [ ] **Step 1: Run static and automated verification**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
```

Expected: typecheck succeeds, all Vitest files pass, and Vite production build succeeds.

- [ ] **Step 2: Run browser-game visual QA**

At an iPhone landscape-equivalent viewport, verify the skill control is reachable at the right safe edge, the attack region still works, only one kill row appears, and the playfield center remains clear.

- [ ] **Step 3: Run six-client stress verification**

Run a 60-second six-client load test. Expected: two matches, stable snapshots, successful admin commands, and zero wall violations.

- [ ] **Step 4: Self-review**

Run `git diff --check` and inspect the exact diff for accidental changes. Preserve all pre-existing uncommitted LAN and v3 asset work.
