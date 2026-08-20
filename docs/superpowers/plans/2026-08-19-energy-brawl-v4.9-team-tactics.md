# v4.9 Team Tactics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add low-latency team coordination and clearer round context to team elimination without adding new characters or lowering visual quality.

**Architecture:** Team signals are authoritative server events, validated against the sender's current team and rate-limited per player. The client keeps the latest signal as transient UI state, renders four compact commands in the arena, and gives text, color, audio, and haptic feedback without changing the simulation snapshot. Elimination HUD gains a round-context line derived from the existing authoritative round state.

**Tech Stack:** TypeScript, Socket.IO typed events, Vitest, existing DOM HUD and CombatAudio/CombatHaptics services.

---

### Task 1: Define and validate team signal protocol

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/network.ts`
- Test: `tests/team-signals.test.ts`

- [x] Add `TeamSignalKind`, `TeamSignalEvent`, and typed `teamSignal` client/server events.
- [x] Validate signal kind, sender session, team membership, match mode, and an 800 ms per-player rate limit before broadcasting only to sockets on the same team.
- [x] Cover valid, invalid, enemy-isolation, and rate-limited cases with a network harness test.

### Task 2: Add client signal controls and feedback

**Files:**
- Modify: `src/client/network.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/team-signals-ui.test.ts`

- [x] Add `sendTeamSignal` and transient `latestTeamSignal` state to `GameNetworkClient`.
- [x] Render 集合、进攻、撤退、需要治疗 controls in the arena template, keyboard shortcuts on desktop, and a one-line signal toast for teammates.
- [x] Preserve full DPR and all existing visual, audio, and haptic effects.
- [x] Hide controls outside team modes and verify mobile landscape layout does not overlap the playfield.

### Task 3: Add round context to elimination HUD

**Files:**
- Modify: `src/client/elimination-ui.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/team-elimination-ui.test.ts`

- [x] Derive a concise round-context label from phase, last round winner, and current score.
- [x] Render it in the existing elimination HUD and keep result overlay behavior unchanged.
- [x] Add regression coverage for prep/live/result and non-elimination modes.

### Task 4: Verify and document

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [x] Run focused Vitest, full Vitest, typecheck, and production build.
- [x] Run browser smoke checks at desktop and iPhone landscape viewports for signal controls, spectator HUD, and round result. Verified in the Codex in-app browser after the user opened the localhost tab.
- [x] Update the unreleased v4.9.0 section with protocol, UI, and testing notes.

### Task 5: Alternate elimination spawn sides safely

**Files:**
- Modify: `src/shared/map-catalog.ts`
- Modify: `src/server/simulation.ts`
- Test: `tests/team-elimination-spawns.test.ts`

- [x] Add explicit `teamElimination3v3` team-region spawn layouts for all three maps.
- [x] Reset players by stable team slot and alternate only the red/blue spawn regions on even rounds.
- [x] Verify round 2 swaps sides, round 3 restores them, team IDs and scores remain unchanged, and every spawn clears map walls.

### Task 6: Show mid-match round history

**Files:**
- Modify: `src/client/elimination-ui.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/team-elimination-round-panel.test.ts`

- [x] Derive a compact latest-first history view from the authoritative elimination snapshot.
- [x] Render the panel only after at least one completed round and keep it clear of touch controls in phone landscape.
- [x] Preserve the existing final results round history.

### Task 7: Defer reconnect control recovery to a round boundary

**Files:**
- Modify: `src/server/room.ts`
- Test: `tests/team-elimination-reconnect.test.ts`

- [x] Track pending control recovery on the room seat when reconnecting during live, overtime, or decisive play.
- [x] Keep the world player bot-controlled for the current round while the authenticated socket remains mapped to its seat.
- [x] At the next result-to-prep reset, restore human control, clear queued input and skill actions, and zero movement/input state.
- [x] Keep immediate control recovery for non-elimination matches and elimination prep/result phases.

### Task 8: Add deduplicated round win/loss feedback

**Files:**
- Create: `src/client/elimination-feedback.ts`
- Modify: `src/client/combat-audio.ts`
- Modify: `src/client/combat-haptics.ts`
- Modify: `src/client/mobile-app.ts`
- Test: `tests/team-elimination-feedback.test.ts`

- [x] Derive one local win/loss event per newly completed round and ignore repeated snapshots.
- [x] Give round wins and losses distinct procedural audio cues without reducing other sound or effect quality.
- [x] Give round wins and losses distinct bounded vibration rhythms that respect the existing haptics mode.

### Task 9: Run release gates and visual QA

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [x] Run focused Vitest during every red-green cycle.
- [x] Run full Vitest, TypeScript typecheck, production build, and `npm.cmd run doctor`.
- [x] Run desktop 1440x900 and iPhone landscape 852x393 browser checks for round history, spectator, result, controls, console cleanliness, and non-overlap. Verified in the Codex in-app browser; the short-landscape lobby pane was narrowed and rechecked with zero horizontal overflow.
- [x] Keep changes uncommitted and unpushed until the user explicitly requests publication.
