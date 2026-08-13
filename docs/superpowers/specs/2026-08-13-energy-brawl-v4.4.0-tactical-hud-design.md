# Energy Brawl v4.4.0 Tactical HUD Design

## Goal

Upgrade combat awareness and post-match clarity without changing map collision, character balance, render quality, input frequency, or snapshot frequency.

## Scope

### Tactical radar

- Add a compact top-right radar during playing, overtime, spectating, and finished phases.
- Render the active map boundary and wall rectangles from the existing map catalog.
- Render the local player, teammates, currently visible enemies, energy orbs, skill orbs, and the domination capture point.
- Enemy markers use the same visibility rule as the playfield so the radar does not reveal hidden opponents through walls or outside the configured awareness radius.
- The radar is a DOM canvas overlay. It consumes the existing `GameSnapshot` and map catalog and does not add network messages.

### Off-screen direction cues

- Show a maximum of three edge cues: contested/hostile capture point, nearest living teammate, and the most recent damage source when known.
- A cue is hidden while its target is inside the camera viewport.
- Cues are clamped to a safe inset that does not collide with the movement stick, attack stick, or skill buttons.
- Damage-source cues decay after three seconds and use snapshot/server time, not wall-clock time.

### Results and MVP

- Extend the authoritative snapshot with `matchMvpId` and `matchMvpScore` only after the match is finished.
- MVP score is deterministic: `kills * 250 + assists * 110 + score * 55 + damageDealt + healingDone * 1.15 + damageTaken * 0.25 + skillContribution * 70 - deaths * 90`.
- Ties are resolved by fewer deaths, then more assists, then stable player id ordering.
- Replace the compact result list with a fixed-height results table showing rank, player, K/D/A, damage, healing, damage taken, skill contribution, and score. The MVP row and local row have distinct styling.
- Preserve the return-to-lobby button and countdown.

## Architecture

- `src/shared/match-results.ts` owns MVP scoring and ranking helpers shared by server and tests.
- `src/client/tactical-radar.ts` owns pure projection, visibility, and cue geometry.
- `src/client/mobile-app.ts` owns DOM lifecycle and presentation; `game-scene.ts` exposes current camera world bounds and last damage-source state through a small HUD state callback.
- Server simulation computes MVP once at match completion and serializes it in the existing snapshot.

## Performance and privacy

- Radar redraw is capped at the existing HUD render cadence and uses one reusable canvas.
- No new textures, external assets, analytics, device data, or network packets are introduced.
- Full DPR, effects, antialiasing, projectile trails, and map visuals remain enabled.

## Testing

- Unit tests: MVP formula/ties, radar projection, hidden-enemy filtering, off-screen cue geometry, three-cue limit.
- Simulation tests: normal finish, forced player/team win, empty-stat fallback, snapshot stability.
- UI tests: result table columns, MVP/local highlighting, radar phase visibility and touch-safe positioning.
- Regression: all existing Vitest, typecheck, production build, three-map six-client load test, diagnostics load test, clean-clone smoke.
- Visual QA: desktop, iPhone landscape, and iPad landscape lobby/combat/results screenshots; verify no overlap, clipped text, blank canvas, console error, or horizontal overflow.

## Release

- Version `4.4.0`.
- Update README and CHANGELOG with tactical radar, cues, MVP rules, verification evidence, and unchanged maximum-quality policy.
