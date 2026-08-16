# Energy Brawl Match Continuity And Feedback Design

## Scope

This increment keeps version `4.5.0` and does not publish a release. It completes the pending quality gates, adds authoritative post-match map-mechanic contributions, differentiates the three map mechanics through sound and haptics, strengthens kill/death camera feedback, and makes repeated matches a deliberate lobby flow.

## Authoritative Map Contributions

Each player snapshot carries a `mapMechanicContribution` object with five counters:

- `reactorEscapes`: warning-zone exposures escaped before activation.
- `neonDamage`: actual post-mitigation damage dealt while Neon Overdrive is active on the attacker.
- `crystalResonances`: completed Crystal Resonance charges.
- `mechanicHealing`: actual health restored by Crystal Resonance.
- `mechanicEliminations`: eliminations completed while Neon Overdrive or Crystal Resonance is active on the attacker.

The server owns every counter. Environmental reactor damage never awards an elimination to another player. MVP scoring adds bounded weights for these counters while preserving the existing kill, assist, damage, healing, tanking, skill, score, and death terms.

## Map Feedback

Clients derive a single feedback event only when an authoritative map-mechanic snapshot crosses into `warning` or `active`. The event key includes map mechanic, round, zone, and stage so duplicate network snapshots cannot replay feedback.

Each mechanic has a distinct audio identity and vibration rhythm:

- Reactor Vent: descending alarm pulses; warning is two short pulses, activation is one long heavy pulse.
- Neon Overdrive: rising digital sweep; warning is a quick double pulse, activation is a fast triple pulse.
- Crystal Resonance: harmonic chime; warning is a spaced soft pair, activation is a balanced three-part pulse.

Audio uses the existing unlocked Web Audio path so iPhone Safari keeps the same gesture-unlock behavior. Devices without vibration receive the existing CSS feedback fallback.

## Combat Camera Feedback

Local kills and local deaths both trigger restrained Phaser camera impulses. Death remains heavier and longer than kill. Hurt feedback stays lighter, and all impulses remain throttled and resolution-independent.

## Continuous Match Flow

The existing room reset remains authoritative: connected humans stay seated, bots and expired seats are removed, and readiness resets. A finished match can return immediately to the lobby or auto-return after the current delay. Random map selection continues to exclude the previous active map when another map exists.

On every match-to-lobby transition the mobile client enters a re-selection state: the previous character remains visible as the current choice, but the player must tap a character card before becoming ready again. The host reset control is presented as a rematch action after a finished match. The existing opening mechanism explanation is reset and replayed for the newly resolved map.

## Verification

Automated verification covers server statistics, MVP scoring, duplicate snapshot suppression, audio policy, vibration bounds, camera profiles, room retention, random rotation, and re-selection gating. Final gates include full Vitest, typecheck, build, asset validation, clean-clone smoke, release doctor, and a 30-minute six-player soak with at least one real phone and one desktop client.
