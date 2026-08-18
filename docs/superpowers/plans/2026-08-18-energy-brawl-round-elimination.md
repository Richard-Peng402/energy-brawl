# v4.8.0 回合制团队歼灭实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不新增角色和地图美术的前提下，为现有 LAN 多人游戏加入服务器权威的 3v3 回合制团队歼灭模式，并保持现有模式、画质、特效和网络行为不回归。

**Architecture:** 新增纯函数回合规则模块负责阶段、计分、加时和决胜判定；`GameRoom` 负责把回合状态接入现有大厅、断线、机器人和房主命令；`simulation.ts` 继续负责移动、碰撞、技能和投射物，只增加回合模式所需的“不可复活”和回合重置边界。快照增加独立的回合状态，客户端 HUD、观战和赛后页面只消费权威状态，不自行计时或判胜。

**Tech Stack:** TypeScript, Vitest, Socket.IO, Phaser 3, Vite, 现有地图/技能/高光/诊断模块。

---

## 文件地图

### 新建

- `src/shared/team-elimination.ts`：回合阶段、参数、比分和胜负判定的纯函数与共享类型。
- `src/server/team-elimination.ts`：服务器回合状态机，连接纯函数与 `GameWorld` 的存活/生命视图。
- `tests/team-elimination.test.ts`：纯规则和边界测试。
- `tests/team-elimination-room.test.ts`：房间、战斗、重连和房主命令集成测试。
- `tests/team-elimination-ui.test.ts`：移动端和主机控制台结构断言。

### 修改

- `src/shared/mode-catalog.ts`：加入 `teamElimination3v3` 模式定义。
- `src/shared/protocol.ts`：增加回合快照、赛后回合摘要和模式配置字段。
- `src/shared/constants.ts`：增加准备、战斗、加时、决胜和重连宽限常量。
- `src/shared/room-presets.ts`：扩展 `RoomPresetV1` 的回合配置，并保持旧预设兼容。
- `src/server/simulation.ts`：回合模式禁止复活、清理回合状态、暴露整队存活视图。
- `src/server/room.ts`：创建、推进、结束和重置回合；接入断线、机器人和神器作用域。
- `src/server/network.ts`：校验新增模式和回合配置，广播扩展后的快照。
- `src/server/bot.ts`：死亡观战期间不发送输入，接管后只选择敌方目标并遵守回合截止时间。
- `src/client/network.ts`：解析回合状态并处理新模式加入/重连快照。
- `src/client/mobile-app.ts`：大厅模式说明、回合 HUD、死亡观战、回合结算和赛后逐回合数据。
- `src/client/game-scene.ts`：按权威观战目标跟随存活队友，回合切换时清理本地特效并重置镜头。
- `src/client/host-app.ts`：房主回合参数、模式说明、回合比分和神器作用域显示。
- `src/client/styles.css`：移动端/桌面端回合 HUD、队伍存活状态和观战层样式。
- `scripts/map-visual-smoke.mjs`：增加回合 HUD、观战和赛后截图流程。
- `README.md`：增加未发布的 v4.8.0 回合制模式说明和测试门禁。

## Task 1: 共享模式与协议契约

**Files:**
- Modify: `src/shared/mode-catalog.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/room-presets.ts`
- Create: `src/shared/team-elimination.ts`
- Test: `tests/mode-catalog.test.ts`, `tests/team-elimination.test.ts`, `tests/room-presets.test.ts`

- [ ] **Step 1: 写失败测试，锁定公共数据契约。**

```ts
it("defines team elimination without changing existing mode objectives", () => {
  expect(isMatchMode("teamElimination3v3")).toBe(true);
  expect(getModeDefinition("teamElimination3v3")).toMatchObject({
    teamCount: 2,
    teamSize: 3,
    objective: "elimination",
  });
});

it("resolves a tied final score through one decisive round", () => {
  const result = resolveEliminationMatch({ roundScores: { red: 3, blue: 3 }, maxScoredRounds: 7, decisiveWinner: "blue" });
  expect(result).toEqual({ kind: "match", winnerTeamId: "blue" });
});
```

- [ ] **Step 2: 运行契约测试确认失败。**

Run: `npm.cmd test -- --run tests/mode-catalog.test.ts tests/team-elimination.test.ts tests/room-presets.test.ts`

Expected: FAIL because the new mode, objective and resolver do not exist.

- [ ] **Step 3: 实现最小共享契约。**

在 `mode-catalog.ts` 增加 `teamElimination3v3`，扩展 `ModeDefinition.objective` 为 `"elimination"`；在 `team-elimination.ts` 定义：

```ts
export type EliminationPhase = "prep" | "live" | "overtime" | "result" | "decisive";
export interface EliminationRules { maxScoredRounds: number; prepMs: number; liveMs: number; overtimeMs: number; decisiveMs: number; }
export interface EliminationScore { red: number; blue: number; }
export interface EliminationResolution { kind: "round" | "match"; winnerTeamId: "red" | "blue" | null; reason: "eliminated" | "timeout" | "decisive" | "forced" | "draw"; }
export function resolveEliminationRound(input: RoundResolutionInput): EliminationResolution;
export function resolveEliminationMatch(input: MatchResolutionInput): EliminationResolution;
```

将默认规则固定为 `maxScoredRounds=7`、`prepMs=8_000`、`liveMs=40_000`、`overtimeMs=10_000`、`decisiveMs=30_000`；旧预设缺失字段时使用这些默认值。

- [ ] **Step 4: 运行契约测试确认通过。**

Run: `npm.cmd test -- --run tests/mode-catalog.test.ts tests/team-elimination.test.ts tests/room-presets.test.ts`

Expected: all targeted tests pass, including invalid ranges and old preset normalization.

- [ ] **Step 5: Commit。**

```powershell
git add src/shared/mode-catalog.ts src/shared/protocol.ts src/shared/constants.ts src/shared/room-presets.ts src/shared/team-elimination.ts tests/mode-catalog.test.ts tests/team-elimination.test.ts tests/room-presets.test.ts
git commit -m "feat: define team elimination contracts"
```

## Task 2: 服务器回合状态机

**Files:**
- Create: `src/server/team-elimination.ts`
- Modify: `src/server/simulation.ts`
- Test: `tests/team-elimination.test.ts`, `tests/simulation.test.ts`

- [ ] **Step 1: 写失败测试覆盖阶段推进和回合重置。**

测试必须验证：准备到战斗、战斗到加时、全队死亡提前结束、时间判定、平局不加分、第 7 回合平分进入决胜、决胜不能平局，以及回合重置清除生命/位置/技能/投射物/地图事件。

- [ ] **Step 2: 运行失败测试。**

Run: `npm.cmd test -- --run tests/team-elimination.test.ts tests/simulation.test.ts`

Expected: new state-machine cases fail while existing simulation cases remain green.

- [ ] **Step 3: 实现纯服务器状态机。**

`src/server/team-elimination.ts` 提供以下接口，禁止访问 Socket.IO 或客户端对象：

```ts
export interface EliminationWorldView { aliveByTeam: Readonly<Record<"red" | "blue", number>>; healthRatioByTeam: Readonly<Record<"red" | "blue", number>>; }
export interface EliminationState { rules: EliminationRules; phase: EliminationPhase; roundIndex: number; scores: EliminationScore; deadline: number; decisive: boolean; }
export function createEliminationState(now: number, rules?: Partial<EliminationRules>): EliminationState;
export function advanceElimination(state: EliminationState, now: number, view: EliminationWorldView): EliminationTransition[];
export function resetEliminationRound(state: EliminationState, now: number): EliminationState;
```

所有时间比较使用服务器 `now`；`advanceElimination` 返回不可变 transition，调用方负责重置世界，防止状态机直接修改战斗对象。

- [ ] **Step 4: 在 `simulation.ts` 接入模式边界。**

为 `GameWorld` 增加 `eliminationState`；`createGameWorld` 仅在新模式初始化它。回合模式下死亡玩家保持 `alive=false`、`respawnAt=null`，`stepWorld` 不调用普通模式复活分支。增加 `resetWorldForEliminationRound(world, now)`，按当前地图出生点重置玩家、清空投射物/技能球临时状态，保留整场击杀和贡献统计。

- [ ] **Step 5: 运行模拟回归。**

Run: `npm.cmd test -- --run tests/team-elimination.test.ts tests/simulation.test.ts tests/collision.test.ts tests/skill-system.test.ts`

Expected: new round tests pass and existing projectile/collision/skill tests remain green.

- [ ] **Step 6: Commit。**

```powershell
git add src/server/team-elimination.ts src/server/simulation.ts tests/team-elimination.test.ts tests/simulation.test.ts
git commit -m "feat: add authoritative elimination round state"
```

## Task 3: GameRoom 生命周期、重连和房主神器

**Files:**
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Modify: `src/server/bot.ts`
- Test: `tests/team-elimination-room.test.ts`, `tests/room.test.ts`, `tests/network.test.ts`, `tests/network-faults.test.ts`

- [ ] **Step 1: 写房间集成失败测试。**

覆盖 6 个席位自动补机器人、回合比分广播、15 秒内重连恢复、超时机器人接管、回合间清理输入/技能队列、准备阶段和对局中神器强制回合/整场获胜，以及非法回合参数拒绝。

- [ ] **Step 2: 运行失败测试。**

Run: `npm.cmd test -- --run tests/team-elimination-room.test.ts tests/room.test.ts tests/network.test.ts tests/network-faults.test.ts`

Expected: new room cases fail without changing current mode behavior.

- [ ] **Step 3: 在 `GameRoom` 中托管回合状态。**

`startMatch` 创建 `eliminationState`；`tick` 在 `stepWorld` 前后调用回合状态机，收到 transition 后调用 `resetWorldForEliminationRound` 或统一 `finishWorldMatch`。`snapshot()` 和 `gameSnapshot()` 发布回合状态、回合比分、阶段截止时间和逐回合摘要。回合模式不得调用普通模式的击杀目标分数结束路径。

- [ ] **Step 4: 接入断线、机器人和神器作用域。**

保留现有 `RECONNECT_WINDOW_MS` 语义；断线玩家在回合内标记观战/机器人，回合重置时按席位恢复。扩展 `forceWinner`/`forceTeamWinner` 的作用域为 `round` 或 `match`，服务器先校验目标队伍和当前阶段，再广播结果。

- [ ] **Step 5: 运行房间和网络测试。**

Run: `npm.cmd test -- --run tests/team-elimination-room.test.ts tests/room.test.ts tests/network.test.ts tests/network-faults.test.ts`

Expected: all new cases pass; existing reconnect, host-admin and fault-injection cases remain green.

- [ ] **Step 6: Commit。**

```powershell
git add src/server/room.ts src/server/network.ts src/server/bot.ts tests/team-elimination-room.test.ts tests/room.test.ts tests/network.test.ts tests/network-faults.test.ts
git commit -m "feat: run team elimination through the authoritative room"
```

## Task 4: 房间预设、主机控制台和共享网络类型

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/shared/room-presets.ts`
- Modify: `src/client/network.ts`
- Modify: `src/client/host-app.ts`
- Modify: `src/client/styles.css`
- Test: `tests/host-presets.test.ts`, `tests/host-layout.test.ts`, `tests/room-presets.test.ts`, `tests/team-elimination-ui.test.ts`

- [ ] **Step 1: 写失败 UI/预设测试。**

断言主机模式选择器包含团队歼灭、回合数/时间控件只在该模式显示、旧预设使用默认回合参数、非法回合参数不应用半套配置、神器控制台显示当前作用域。

- [ ] **Step 2: 实现协议和预设字段。**

在 `RoomSnapshot`/`GameSnapshot` 增加：

```ts
elimination?: { phase: EliminationPhase; roundIndex: number; roundScores: TeamScoreSnapshot[]; deadline: number; maxScoredRounds: number; decisive: boolean; }
```

在 `RoomPresetV1` 增加 `eliminationRules`，归一化范围为回合 `1..7`、准备 `5_000..15_000`、战斗 `20_000..90_000`、加时 `5_000..20_000`、决胜 `15_000..60_000`。

- [ ] **Step 3: 实现主机控制台。**

沿用 `host-app.ts` 的大厅权限判断和 `admin()` 调用，增加回合参数表单、模式说明、回合比分、阶段和强制获胜作用域；输入变更后只发送一个完整的 `applyRoomPreset` 或对应 `hostAdminCommand`，不发送局部未验证字段。

- [ ] **Step 4: 运行 UI/预设测试。**

Run: `npm.cmd test -- --run tests/host-presets.test.ts tests/host-layout.test.ts tests/room-presets.test.ts tests/team-elimination-ui.test.ts`

Expected: all controls have stable IDs, no overlap assertions fail, and old presets remain valid.

- [ ] **Step 5: Commit。**

```powershell
git add src/shared/protocol.ts src/shared/room-presets.ts src/client/network.ts src/client/host-app.ts src/client/styles.css tests/host-presets.test.ts tests/host-layout.test.ts tests/room-presets.test.ts tests/team-elimination-ui.test.ts
git commit -m "feat: expose elimination rules in host controls"
```

## Task 5: 移动端 HUD、观战和赛后回合数据

**Files:**
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/styles.css`
- Modify: `src/shared/match-results.ts`
- Modify: `src/server/match-highlight-tracker.ts`
- Test: `tests/team-elimination-ui.test.ts`, `tests/match-results.test.ts`, `tests/match-highlight-ui.test.ts`, `tests/camera-follow.test.ts`

- [ ] **Step 1: 写失败 UI 和结果测试。**

断言 HUD 显示比分/回合/阶段/存活人数；死亡玩家没有复活按钮并显示观战对象；回合结果只显示一条播报；赛后包含逐回合胜负、结束原因和总 MVP；镜头在本人死亡后跟随存活队友，下一回合切回本人。

- [ ] **Step 2: 实现移动端状态渲染。**

在 `mobileTemplate()` 增加固定尺寸的 `#elimination-hud`、`#elimination-spectator` 和 `#elimination-round-result`；`renderGameHud` 只读 `GameSnapshot.elimination`，使用 `deadline - serverTime` 计算显示值但不改变状态；`renderResults` 增加逐回合列表并复用现有高光卡片。

- [ ] **Step 3: 实现观战镜头。**

在 `game-scene.ts` 的快照应用后选择同队且 `alive` 的最近队友作为临时观察目标；复活/下一回合 transition 到达时清除观察目标并调用现有 `shouldSnapCameraOnRespawn` 路径。没有可观战队友时保持地图中心，不显示黑屏。

- [ ] **Step 4: 运行移动端与结果测试。**

Run: `npm.cmd test -- --run tests/team-elimination-ui.test.ts tests/match-results.test.ts tests/match-highlight-ui.test.ts tests/camera-follow.test.ts tests/mobile-layout.test.ts tests/mobile-viewport.test.ts`

Expected: desktop/mobile layout assertions pass, no horizontal overflow or control overlap is introduced.

- [ ] **Step 5: Commit。**

```powershell
git add src/client/mobile-app.ts src/client/game-scene.ts src/client/styles.css src/shared/match-results.ts src/server/match-highlight-tracker.ts tests/team-elimination-ui.test.ts tests/match-results.test.ts tests/match-highlight-ui.test.ts tests/camera-follow.test.ts
git commit -m "feat: add elimination HUD spectator and round results"
```

## Task 6: 地图事件、音频反馈和机器人策略回归

**Files:**
- Modify: `src/server/map-event-system.ts`
- Modify: `src/client/map-event-visuals.ts`
- Modify: `src/client/combat-audio.ts`
- Modify: `src/client/combat-haptics.ts`
- Modify: `src/server/bot.ts`
- Test: `tests/map-event-system.test.ts`, `tests/map-event-visuals.test.ts`, `tests/environment-audio.test.ts`, `tests/combat-haptics.test.ts`, `tests/bot.test.ts`

- [ ] **Step 1: 写失败回归测试。**

验证准备阶段事件不可见/不可伤害、回合结束事件清理、同一回合最多一个事件、机器人在危险区仍只选择敌方、死亡和观战期间不播放本地攻击反馈。

- [ ] **Step 2: 实现回合事件边界和反馈去重。**

让事件系统接受 `roundIndex` 作为种子/边界；回合 reset 时清除事件序号基线。客户端以 `roundIndex:eventSeq` 去重，复用现有独立地图音效和震动模式，不新增素材。

- [ ] **Step 3: 运行反馈与机器人测试。**

Run: `npm.cmd test -- --run tests/map-event-system.test.ts tests/map-event-visuals.test.ts tests/environment-audio.test.ts tests/combat-haptics.test.ts tests/bot.test.ts`

Expected: no duplicate event sound/haptics, no allied bot target and no cross-round visual residue.

- [ ] **Step 4: Commit。**

```powershell
git add src/server/map-event-system.ts src/client/map-event-visuals.ts src/client/combat-audio.ts src/client/combat-haptics.ts src/server/bot.ts tests/map-event-system.test.ts tests/map-event-visuals.test.ts tests/environment-audio.test.ts tests/combat-haptics.test.ts tests/bot.test.ts
git commit -m "feat: bound map events and bot feedback by round"
```

## Task 7: 真实流程视觉烟测和压力门禁

**Files:**
- Modify: `scripts/map-visual-smoke.mjs`
- Modify: `scripts/v4-load-test.ts`
- Modify: `tests/map-visual-smoke-script.test.ts`
- Modify: `tests/v4-load-test.test.ts`
- Create: `tests/team-elimination-matrix.test.ts`

- [ ] **Step 1: 写测试脚本契约。**

断言烟测流程必须覆盖大厅选模式、准备、开局、击杀一名玩家、死亡观战、回合结算、下一回合和整场赛后；压力矩阵覆盖 `3v3 × 3 maps × events on/off`，检查穿墙、回合状态残留、快照体积和服务端步进预算。

- [ ] **Step 2: 扩展自动化脚本。**

沿用现有短对局/独立设备策略；每台设备分别捕获大厅、战斗 HUD、观战层、回合结果和赛后页面，继续使用完整物理 DPR、非空画布、无横向溢出和控件边界断言。脚本输出 `roundIndex`、`phase`、`roundScores` 和观战目标，截图前采样权威快照。

- [ ] **Step 3: 运行专项门禁。**

Run: `npm.cmd test -- --run tests/team-elimination-matrix.test.ts tests/v4-load-test.test.ts tests/map-visual-smoke-script.test.ts`

Expected: all matrix combinations pass; no wall violation, stale effect, duplicate result or visual overlap is reported.

- [ ] **Step 4: 运行真实浏览器视觉烟测。**

Run: `npm.cmd run smoke:maps`

Expected: desktop、iPhone 横屏、iPad 横屏的回合 HUD/观战/结果截图全部生成并人工检查。

- [ ] **Step 5: Commit。**

```powershell
git add scripts/map-visual-smoke.mjs scripts/v4-load-test.ts tests/team-elimination-matrix.test.ts tests/v4-load-test.test.ts tests/map-visual-smoke-script.test.ts
git commit -m "test: gate team elimination flow and visuals"
```

## Task 8: 全量验证、文档和发布前门禁

**Files:**
- Modify: `README.md`
- Modify: `package.json` only if a new test script is needed; do not bump version before release approval.

- [ ] **Step 1: 更新 README 未发布章节。**

记录模式规则、回合边界、观战/重连、房主作用域、无新增角色素材和测试门禁；明确当前仍是开发内容，不创建标签或 Release。

- [ ] **Step 2: 运行全量验证。**

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run assets:v3
npm.cmd run assets:v4
npm.cmd run assets:presentation
npm.cmd run smoke:clean-clone
npm.cmd run doctor
```

Expected: all Vitest files pass, typecheck/build/assets/clean-clone/doctor exit 0；诊断报告显示版本一致、241 个以上运行时素材可加载、防火墙规则有效。

- [ ] **Step 3: 完成最终视觉审查。**

逐张检查新截图：回合比分不遮挡地图、观战层不遮挡摇杆、手机横屏无页面放大、回合切换镜头不黑屏、角色和武器图层顺序不回归、所有子弹拖尾和地图事件特效保持可见。

- [ ] **Step 4: Commit 开发文档。**

```powershell
git add README.md package.json
git commit -m "docs: record team elimination development gates"
```

- [ ] **Step 5: 发布前停止并请求版本确认。**

不要自动修改版本号、创建标签或推送 Release；待完整测试、视觉审查和真实多设备对局确认后，再单独执行版本发布流程。
