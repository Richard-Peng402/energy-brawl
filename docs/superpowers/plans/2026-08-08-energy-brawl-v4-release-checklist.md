# Energy Brawl v4.0 Release Checklist

## Scope

- [x] Solo, 3v3, and 2v2v2 modes with authoritative team assignment and scoring.
- [x] Six character-exclusive skills with independent cooldowns and mobile controls.
- [x] Host mode, team swap, cooldown, player winner, and team winner commands mutate server state before acknowledgement.
- [x] Friendly fire disabled in team modes while projectiles pass through teammates.
- [x] Personal killstreak audio retained in every mode.
- [x] v4 skill assets included under `public/assets/v4` with a manifest.

## Verification commands

```powershell
npm.cmd run assets:v4
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run load-test:v4
git diff --check
```

## Manual device checks

- [x] Desktop host console: mode selection, team swap, cooldown editing, forced team winner.
- [ ] iPhone landscape: audio unlock, attack joystick, both skill buttons, cooldown feedback.
- [x] 844x390 mobile browser viewport: no overlap, no page zoom, indicators stay visible.
- [ ] All modes: return to lobby and personal killstreak audio.

## Repository audit

- [x] Branch is `codex/v4.0-team-skills`; `main` is not overwritten.
- [x] No build output or dependency directory is intentionally staged.
- [x] Host token is generated at runtime and is not committed.
- [x] v4 runtime assets are represented in `public/assets/v4/manifest.json`.
