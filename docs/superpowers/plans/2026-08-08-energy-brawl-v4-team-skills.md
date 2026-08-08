# Energy Brawl v4.0 Team Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在 v3.4.0 的服务器权威 LAN 架构上加入个人战/3v3/2v2v2、六名角色专属技能、独立技能指示器与可公开授权的过程特效，同时保持所有模式的个人连杀音效规则。

**Architecture:** 服务器继续拥有模式、队伍、积分、技能冷却、位移终点和技能结果；客户端只发送输入/技能请求并渲染服务器快照和一次性技能事件。模式规则、队伍分配、专属技能规则、指示器和特效分别放入独立模块，通过现有 `Room`、`Simulation`、Socket.IO 事件和 Phaser 场景连接。

**Tech Stack:** TypeScript 5.9, Phaser 3.90, Socket.IO 4.8, Express 5, Vite 7, Vitest 3, Node.js 22+。

---

## Baseline and working rules

- 基线提交：`ff53b78 release: prepare energy brawl v3.4 open source`。
- 当前分支：`codex/v4.0-team-skills`。
- 每个任务先写失败测试，再写最小实现；任务完成后运行该任务测试和受影响回归。
- 每个任务独立提交，提交前运行 `git diff --check`。
- 不修改 v3.4 分支；不提交 `node_modules/`、`dist/`、`coverage/` 或 `artifacts/`。
- 技能和模式的规则测试必须是服务端测试；浏览器测试只验证输入、布局、核心反馈和性能。

## File map

| 责任 | 文件 |
|---|---|
| 模式目录与目标分 | `src/shared/mode-catalog.ts`, `src/shared/constants.ts` |
| 协议状态和事件 | `src/shared/protocol.ts` |
| 角色专属技能定义 | `src/shared/skill-catalog.ts`, `src/shared/character-catalog.ts` |
| 队伍分配和房间生命周期 | `src/server/team-system.ts`, `src/server/room.ts` |
| 权威技能规则 | `src/server/exclusive-skill-system.ts`, `src/server/simulation.ts` |
| 网络请求和广播 | `src/server/network.ts`, `src/client/network.ts` |
| 房主模式/分队/冷却控制台 | `src/server/host-admin.ts`, `src/client/host-app.ts` |
| 移动端选择和双技能按钮 | `src/client/mobile-app.ts`, `src/client/styles.css` |
| 指示器与技能过程特效 | `src/client/skill-indicator.ts`, `src/client/skill-effects.ts`, `src/client/game-scene.ts` |
| v4 素材管线 | `scripts/import-v4-skill-assets.mjs`, `public/assets/v4/manifest.json` |
| 回归和压力测试 | `tests/mode-catalog.test.ts`, `tests/team-system.test.ts`, `tests/exclusive-skill-system.test.ts`, `tests/network.test.ts`, `tests/skill-indicator.test.ts`, `tests/runtime-assets.test.ts`, `tests/v4-load-test.test.ts` |

## Task 1: Add mode and team domain types

**Files:**
- Create: `src/shared/mode-catalog.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/mode-catalog.test.ts`

- [ ] **Step 1: Write failing tests for mode metadata and target scaling.**

```ts
import { describe, expect, it } from "vitest";
import { MATCH_MODES, getModeDefinition, isMatchMode } from "../src/shared/mode-catalog";

describe("v4 match modes", () => {
  it("defines personal, 3v3, and 2v2v2 with scaled team targets", () => {
    expect(MATCH_MODES).toEqual(["solo", "team3v3", "team2v2v2"]);
    expect(getModeDefinition("solo").targetScore).toBe(20);
    expect(getModeDefinition("team3v3").targetScore).toBe(60);
    expect(getModeDefinition("team2v2v2").targetScore).toBe(40);
  });

  it("rejects unknown modes", () => {
    expect(isMatchMode("capture")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure.**

Run: `npm.cmd test -- --run tests/mode-catalog.test.ts`

Expected: FAIL because `src/shared/mode-catalog.ts` does not exist.

- [ ] **Step 3: Implement the mode catalog and protocol primitives.**

Define `MatchMode = "solo" | "team3v3" | "team2v2v2"`, `TeamId = "red" | "blue" | "gold"`, and `ModeDefinition` with `teamCount`, `teamSize`, `targetScore`. Export `MATCH_MODES`, `getModeDefinition`, and `isMatchMode`. Add `DEFAULT_EXCLUSIVE_SKILL_COOLDOWN_MS = 10_000`, `MIN_EXCLUSIVE_SKILL_COOLDOWN_MS = 1_000`, and `MAX_EXCLUSIVE_SKILL_COOLDOWN_MS = 60_000`.

Extend snapshots with `matchMode`, `teamId`, team score data, `exclusiveSkill`, and `exclusiveSkillReadyAt`; add a sequenced `skillEvent` payload to the server event contract.

- [ ] **Step 4: Run the focused test and typecheck.**

Run: `npm.cmd test -- --run tests/mode-catalog.test.ts` and `npm.cmd run typecheck`

Expected: 2 mode tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit the domain contract.**

```powershell
git add src/shared/mode-catalog.ts src/shared/constants.ts src/shared/protocol.ts tests/mode-catalog.test.ts
git commit -m "feat: define v4 match modes and team contracts"
```

## Task 2: Implement server team assignment and lobby mode locking

**Files:**
- Create: `src/server/team-system.ts`
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Test: `tests/team-system.test.ts`, `tests/room.test.ts`

- [ ] **Step 1: Write failing tests for balanced teams and unique roles.**

Cover `assignBalancedTeams(players, mode)`, `swapTeams(playerA, playerB)`, `canStartMode(room)`, AI fill, same-team duplicate rejection, and rejection after the phase changes from `lobby` to `playing`.

```ts
it("balances 3v3 teams and rejects a duplicate role on one team", () => {
  const room = new GameRoom();
  joinSixReadyPlayers(room, "team3v3");
  expect(teamSizes(room)).toEqual([3, 3]);
  expect(room.changeCharacter(room.players[1]!.id, room.players[0]!.characterId)).toEqual({
    ok: false,
    error: "同队角色不能重复",
  });
});
```

The test file defines `joinSixReadyPlayers` by calling the existing public join and ready APIs six times; it is a fixture helper, not a production API.

- [ ] **Step 2: Run the focused tests and verify failure before implementation.**

Run: `npm.cmd test -- --run tests/team-system.test.ts tests/room.test.ts`

Expected: FAIL because team assignment and mode fields are absent.

- [ ] **Step 3: Implement deterministic team helpers.**

`team-system.ts` exposes `teamIdsForMode(mode)`, `assignBalancedTeams(seats, mode)`, `swapTeams(seats, firstId, secondId)`, `teamSizes(seats)`, and `hasDuplicateCharacterOnTeam(seats)`. Sort human seats by join order, fill teams round-robin, and append AI seats to the smallest team.

- [ ] **Step 4: Add room commands and phase locking.**

Add `setMatchMode(mode)`, `swapPlayerTeams(firstId, secondId)`, and `teamSnapshot()` to `GameRoom`. Accept them only in `lobby`; broadcast `roomState` after success. `startMatch()` assigns AI, validates team sizes and duplicate roles, copies team IDs into the simulation seed, and freezes mode/team selection until `returnToLobby()`.

- [ ] **Step 5: Run focused tests and commit.**

Run: `npm.cmd test -- --run tests/team-system.test.ts tests/room.test.ts`

Expected: team tests pass for AI fill, swapping, phase lock, and duplicate-role rejection.

```powershell
git add src/server/team-system.ts src/server/room.ts src/server/network.ts tests/team-system.test.ts tests/room.test.ts
git commit -m "feat: add authoritative team assignment and mode locking"
```

## Task 3: Add authoritative team scoring and friendly-fire rules

**Files:**
- Modify: `src/server/simulation.ts`
- Modify: `src/server/room.ts`
- Test: `tests/simulation.test.ts`, `tests/collision.test.ts`

- [ ] **Step 1: Write failing tests for scaled team scores and friendly projectiles.**

Add cases for targets 20/40/60; a kill updates personal stats and the killer’s team; friendly damage is ignored; friendly projectiles pass through teammates; existing hold/overtime rules use team leaders.

- [ ] **Step 2: Run the simulation tests and verify failure.**

Run: `npm.cmd test -- --run tests/simulation.test.ts tests/collision.test.ts`

Expected: FAIL on missing team score and team-aware collision behavior.

- [ ] **Step 3: Implement team-aware scoring and collision.**

Add team scores to world state, resolve score recipients through `teamId`, and use `getModeDefinition(mode).targetScore`. In projectile collision, skip players whose non-null `teamId` equals the projectile owner’s team; retain wall collision and enemy damage.

- [ ] **Step 4: Run focused tests and commit.**

Run: `npm.cmd test -- --run tests/simulation.test.ts tests/collision.test.ts`

Expected: existing solo tests and new team tests pass.

```powershell
git add src/server/simulation.ts src/server/room.ts tests/simulation.test.ts tests/collision.test.ts
git commit -m "feat: add team scoring and friendly-fire rules"
```

## Task 4: Add host mode, team, and exclusive cooldown commands

**Files:**
- Modify: `src/server/host-admin.ts`
- Modify: `src/server/network.ts`
- Modify: `src/server/room.ts`
- Modify: `src/client/host-app.ts`
- Test: `tests/host-admin.test.ts`, `tests/network.test.ts`, `tests/host-state.test.ts`

- [ ] **Step 1: Write failing authorization and end-to-end tests.**

Test `setMode`, `swapTeams`, `setExclusiveSkillCooldown`, and `forceTeamWinner` for loopback-only access, token validation, phase rules, value range 1–60 seconds, actual room mutation, broadcast state, idempotence, and rejection without mutation.

```ts
it("does not report success until the server changes the cooldown", async () => {
  const result = await emitAck(client, "hostAdminCommand", {
    token,
    command: { type: "setStat", playerId, stat: "exclusiveSkillCooldownMs", value: 5_000 },
  });
  expect(result).toEqual({ ok: true });
  expect(room.player(playerId).exclusiveSkillCooldownMs).toBe(5_000);
});
```

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm.cmd test -- --run tests/host-admin.test.ts tests/network.test.ts tests/host-state.test.ts`

Expected: FAIL because new commands and cooldown stat are not accepted.

- [ ] **Step 3: Implement server validation before client UI.**

Extend `AdminStat` and `STAT_RANGES`; add exact validation for mode, team swap, and forced team winner. Record `applied` only after `GameRoom.applyHostAdminCommand()` returns `{ ok: true }`.

- [ ] **Step 4: Implement host UI controls.**

Add a mode selector, team badges, swap buttons, team target display, and cooldown field. Disable mode/team controls outside `lobby`; render server-confirmed state after each command.

- [ ] **Step 5: Run focused tests and commit.**

Run: `npm.cmd test -- --run tests/host-admin.test.ts tests/network.test.ts tests/host-state.test.ts`

```powershell
git add src/server/host-admin.ts src/server/network.ts src/server/room.ts src/client/host-app.ts tests/host-admin.test.ts tests/network.test.ts tests/host-state.test.ts
git commit -m "feat: add host mode team and skill cooldown controls"
```

## Task 5: Implement authoritative exclusive skill rules

**Files:**
- Create: `src/server/exclusive-skill-system.ts`
- Modify: `src/shared/skill-catalog.ts`
- Modify: `src/shared/character-catalog.ts`
- Modify: `src/server/simulation.ts`
- Modify: `src/server/room.ts`
- Test: `tests/exclusive-skill-system.test.ts`, `tests/character-catalog.test.ts`

- [ ] **Step 1: Write failing tests for all six skill state machines.**

Cover cooldown, action sequences, death cleanup, Medic healing, Fortress frontal reduction/fire slowdown, Arc buffs, Phase safe wall crossing, Runner buffs, and Blaze anchor/dash/return.

```ts
it("keeps a Blaze anchor, allows one dash, then allows a safe return", () => {
  const state = createSkillWorld("blaze", { x: 400, y: 400 });
  expect(useExclusiveSkill(state, { moveX: 1, moveY: 0 })).toMatchObject({ type: "anchorCreated" });
  expect(useExclusiveSkill(state, { moveX: 1, moveY: 0 })).toMatchObject({ type: "dashCompleted" });
  expect(useExclusiveSkill(state, { moveX: 0, moveY: 0 })).toMatchObject({ type: "returnCompleted" });
});
```

- [ ] **Step 2: Run skill tests and verify failure.**

Run: `npm.cmd test -- --run tests/exclusive-skill-system.test.ts tests/character-catalog.test.ts`

Expected: FAIL because exclusive skill state and events do not exist.

- [ ] **Step 3: Define six skill catalog entries.**

Each entry includes `id`, `name`, `characterId`, `cooldownMs`, `durationMs`, `description`, and stable `effectKind`. Event payloads include `eventSeq`, `serverTime`, `playerId`, `skillId`, `origin`, `target`, and `result`.

- [ ] **Step 4: Implement one server state machine with per-skill handlers.**

Expose `canUseExclusiveSkill(player, now)`, `applyExclusiveSkill(world, playerId, input, now)`, `clearExclusiveSkillState(player)`, and `advanceExclusiveSkillEffects(world, deltaMs)`. Reject cooldown, dead players, malformed sequence, unsafe positions, and invalid targets before changing state. Emit an event only after successful mutation.

- [ ] **Step 5: Run skill and solo regression tests, then commit.**

Run: `npm.cmd test -- --run tests/exclusive-skill-system.test.ts tests/character-catalog.test.ts tests/simulation.test.ts`

```powershell
git add src/server/exclusive-skill-system.ts src/shared/skill-catalog.ts src/shared/character-catalog.ts src/server/simulation.ts src/server/room.ts tests/exclusive-skill-system.test.ts tests/character-catalog.test.ts tests/simulation.test.ts
git commit -m "feat: add authoritative character exclusive skills"
```

## Task 6: Add network skill events and independent mobile input

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/network.ts`
- Modify: `src/client/network.ts`
- Create: `src/client/skill-indicator.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/skill-indicator.test.ts`, `tests/mobile-layout.test.ts`, `tests/network.test.ts`

- [ ] **Step 1: Write failing tests for event ordering and input separation.**

Test monotonic action/event sequences, duplicate rejection, indicators not changing the attack aim vector, and two skill buttons outside the attack joystick bounds.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm.cmd test -- --run tests/skill-indicator.test.ts tests/mobile-layout.test.ts tests/network.test.ts`

Expected: FAIL because the skill input router and event listener do not exist.

- [ ] **Step 3: Implement the independent input router.**

Create `SkillIndicatorController` with `begin(skillId)`, `update(pointer, moveVector, aimVector)`, `cancel()`, and `release()`. Use the left vector only for Blaze, the right aim vector only for Phase, and never write to `PlayerInput.aimX/aimY`.

- [ ] **Step 4: Add two mobile buttons and event consumption.**

Add exclusive and generic skill DOM buttons. Use hold-to-preview/release-to-cast for exclusive skills; keep the generic skill as tap. Cache consumed `skillEvent.eventSeq` values so reconnection does not replay events.

- [ ] **Step 5: Run focused tests and commit.**

Run: `npm.cmd test -- --run tests/skill-indicator.test.ts tests/mobile-layout.test.ts tests/network.test.ts`

```powershell
git add src/shared/protocol.ts src/server/network.ts src/client/network.ts src/client/skill-indicator.ts src/client/mobile-app.ts src/client/styles.css tests/skill-indicator.test.ts tests/mobile-layout.test.ts tests/network.test.ts
git commit -m "feat: add independent mobile skill controls and events"
```

## Task 7: Add licensed v4 skill art and process effect pools

**Files:**
- Create: `scripts/import-v4-skill-assets.mjs`
- Create: `public/assets/v4/manifest.json`
- Create: `public/assets/v4/fx/skills/`
- Create: `src/client/skill-effects.ts`
- Modify: `src/client/asset-registry.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `THIRD_PARTY_ASSETS.md`
- Modify: `package.json`
- Test: `tests/v4-skill-assets.test.ts`, `tests/runtime-assets.test.ts`, `tests/effect-pool.test.ts`

- [ ] **Step 1: Write failing asset and effect tests.**

Assert six skill directories, four phases per skill, approved URLs, `/assets/v4/` outputs, size limits, manifest coverage, pool reuse, distinct effect kinds, and low-performance preservation of indicators/ranges.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm.cmd test -- --run tests/v4-skill-assets.test.ts tests/runtime-assets.test.ts tests/effect-pool.test.ts`

Expected: FAIL because v4 assets, manifest, registry keys, and effect pools do not exist.

- [ ] **Step 3: Acquire redistributable source assets.**

Use CC0 first; use CC-BY/CC-BY-SA only with author and license recorded. Record original URL, author, license, transformation, and outputs. Exclude commercial game assets and unknown licenses.

- [ ] **Step 4: Implement deterministic import and validation.**

`import-v4-skill-assets.mjs` validates approved sources, file existence, PNG dimensions, SVG/WAV format, lobby budget, and one-to-one manifest coverage. Add `assets:v4` to `package.json`.

- [ ] **Step 5: Implement effect pools and event rendering.**

Create `SkillEffectPool` methods `showTelegraph`, `showCast`, `showImpact`, and `showEnd`. Use fixed-capacity pools and role color tokens; never create unbounded emitters per event.

- [ ] **Step 6: Run asset/effect tests and commit.**

Run: `npm.cmd run assets:v4` and `npm.cmd test -- --run tests/v4-skill-assets.test.ts tests/runtime-assets.test.ts tests/effect-pool.test.ts`

```powershell
git add scripts/import-v4-skill-assets.mjs public/assets/v4 src/client/skill-effects.ts src/client/asset-registry.ts src/client/game-scene.ts tests/v4-skill-assets.test.ts tests/runtime-assets.test.ts tests/effect-pool.test.ts THIRD_PARTY_ASSETS.md package.json
git commit -m "feat: add licensed v4 skill effects and manifest"
```

## Task 8: Render team lobby, HUD, indicators, and results

**Files:**
- Modify: `src/client/host-app.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/styles.css`
- Test: `tests/host-state.test.ts`, `tests/mobile-layout.test.ts`, `tests/camera-follow.test.ts`

- [ ] **Step 1: Write failing presentation tests.**

Assert mode labels, team colors/scores/targets, teammate health/skill status, individual streaks, team winner, return-to-lobby, and disabled host controls outside lobby.

- [ ] **Step 2: Implement DOM overlay presentation.**

Keep lobby/HUD/result text in DOM; keep Phaser responsible for playfield, indicators, camera, and effects. Render team score separately from personal score and keep the single-line kill feed.

- [ ] **Step 3: Verify landscape controls in browser.**

At desktop and 844×390, confirm the attack joystick remains on the right, both skill buttons do not overlap it, indicators stay in the viewport, and result screens expose return-to-lobby.

- [ ] **Step 4: Run focused tests and commit.**

Run: `npm.cmd test -- --run tests/host-state.test.ts tests/mobile-layout.test.ts tests/camera-follow.test.ts` and `npm.cmd run build`

```powershell
git add src/client/host-app.ts src/client/mobile-app.ts src/client/game-scene.ts src/client/styles.css tests/host-state.test.ts tests/mobile-layout.test.ts tests/camera-follow.test.ts
git commit -m "feat: add team HUD lobby controls and skill indicators"
```

## Task 9: Preserve cross-mode killstreak audio

**Files:**
- Modify: `src/client/combat-audio.ts`
- Modify: `src/client/combat-feedback.ts`
- Modify: `src/server/simulation.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/combat-audio.test.ts`, `tests/combat-feedback.test.ts`, `tests/simulation.test.ts`

- [ ] **Step 1: Add parameterized tests for all modes.**

Use one kill fixture with all three modes; assert local-only audio, tiers 1–5, tier-five clamping, death reset, AI kills, and no sound for friendly/duplicate events.

- [ ] **Step 2: Implement server-authoritative personal streak events.**

Keep personal `kills` and `killStreak` separate from team score. Emit one monotonic kill event after mutation; play audio only when `killerId` equals the local player ID.

- [ ] **Step 3: Run tests and commit.**

Run: `npm.cmd test -- --run tests/combat-audio.test.ts tests/combat-feedback.test.ts tests/simulation.test.ts`

```powershell
git add src/client/combat-audio.ts src/client/combat-feedback.ts src/server/simulation.ts src/shared/protocol.ts tests/combat-audio.test.ts tests/combat-feedback.test.ts tests/simulation.test.ts
git commit -m "feat: preserve personal killstreak audio across modes"
```

## Task 10: Add six-client mode/skill load coverage

**Files:**
- Create: `scripts/v4-load-test.ts`
- Create: `tests/v4-load-test.test.ts`
- Modify: `package.json`
- Test: `tests/network.test.ts`, `tests/performance.test.ts`

- [ ] **Step 1: Write a deterministic load-test assertion.**

Start one server, connect six clients, select 3v3, assign teams, send movement/shooting/skill requests for 60 seconds of simulated time, and assert no duplicate skill events, zero wall violations, stable scores, and snapshot rates within limits.

- [ ] **Step 2: Implement the load script.**

Reuse the v3 Socket.IO setup, add mode/team/skill requests, collect per-client snapshot counts, skill event counts, server step p95, and rejected-request counts, and exit non-zero on invariant failure.

- [ ] **Step 3: Run focused load tests and commit.**

Run: `npm.cmd test -- --run tests/v4-load-test.test.ts tests/network.test.ts tests/performance.test.ts`

```powershell
git add tests/v4-load-test.test.ts scripts/v4-load-test.ts package.json tests/network.test.ts tests/performance.test.ts
git commit -m "test: cover six-client v4 team skill load"
```

## Task 11: Full verification, versioning, and release documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/server/index.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `THIRD_PARTY_ASSETS.md`
- Create: `docs/superpowers/plans/2026-08-08-energy-brawl-v4-release-checklist.md`

- [ ] **Step 1: Update version metadata to `4.0.0`.**

Update package/lockfile/API/README/changelog versions. Do not change v3.4 history.

- [ ] **Step 2: Run the full verification matrix.**

```powershell
npm.cmd run assets:v4
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
git diff --check
npm.cmd run load-test:v4
```

Expected: asset validation, Vitest, typecheck, build, diff check, and load test all succeed with zero unexplained skips.

- [ ] **Step 3: Run browser and device checks.**

Verify desktop host mode selection/team swap/cooldown/forced winner; mobile 844×390 indicators; iPhone/Android audio unlock; all modes; and return-to-lobby. Record screenshots only for changed surfaces.

- [ ] **Step 4: Audit staged content.**

Confirm no `node_modules/`, `dist/`, `coverage/`, `artifacts/`, local paths, tokens, private keys, or unlicensed art. Confirm every runtime asset is represented in a manifest.

- [ ] **Step 5: Commit v4.0 release metadata.**

```powershell
git add package.json package-lock.json src/server/index.ts README.md CHANGELOG.md THIRD_PARTY_ASSETS.md docs/superpowers/plans/2026-08-08-energy-brawl-v4-release-checklist.md
git commit -m "release: prepare energy brawl v4.0"
```

- [ ] **Step 6: Push and open a Pull Request.**

```powershell
git push --set-upstream origin codex/v4.0-team-skills
gh pr create --base main --head codex/v4.0-team-skills --title "release: Energy Brawl v4.0 team skills" --body-file docs/superpowers/plans/2026-08-08-energy-brawl-v4-release-checklist.md
```

Do not merge or overwrite `main` automatically.
