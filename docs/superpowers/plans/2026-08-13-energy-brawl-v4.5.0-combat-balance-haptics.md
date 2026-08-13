# Energy Brawl v4.5.0 竞技平衡与战斗震动实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不降低画质、DPR、特效或网络频率的前提下，重做六名角色的统一战斗数值与专属技能反制，并加入跨设备战斗震动/替代反馈。

**Architecture:** 将角色基础数值和专属技能参数提取为共享唯一配置；服务端以时间戳状态模块权威计算减伤、压制、净化、显形和射击锁定；客户端通过标准化战斗反馈事件驱动 `CombatHaptics` 与视觉冲击，场景不直接调用浏览器振动 API。房主神器继续作为服务器授权覆盖层。

**Tech Stack:** TypeScript, Vitest, Phaser 3, Socket.IO, Vite, Node.js 22, GitHub Actions。

---

## 实施顺序与提交边界

按以下顺序执行，每个任务完成后单独提交，提交前运行该任务列出的定向测试：

1. 共享平衡配置与角色选择数据
2. 服务端专属技能参数与状态效果
3. 伤害、移动、射击和治疗规则接入
4. 房主神器覆盖兼容
5. 客户端战斗反馈事件管线
6. `CombatHaptics` 震动模块和设置
7. Phaser 视觉反馈与技能状态展示
8. 自动化测试、压力测试和版本发布

## 文件地图

### 新建文件

- `src/shared/character-balance.ts`：六名角色的基础数值、TTK 元数据和展示字段。
- `src/shared/exclusive-skill-balance.ts`：六套专属技能距离、持续时间、倍率、范围、角度和反制参数。
- `src/server/status-effects.ts`：服务端状态类型、添加/刷新、净化、过期和清理。
- `src/client/combat-haptics.ts`：振动 API 能力检测、事件队列、节流、强度缩放、停止和不支持设备降级。
- `tests/character-balance.test.ts`：角色数值与 TTK 基准。
- `tests/status-effects.test.ts`：状态生命周期和净化。
- `tests/combat-haptics.test.ts`：震动事件、节流、设置和降级。

### 修改文件

- `src/shared/character-catalog.ts`：改为引用 `character-balance.ts`，保留角色目录和选择界面接口。
- `src/shared/exclusive-skill-catalog.ts`：改为引用 `exclusive-skill-balance.ts` 的唯一参数。
- `src/server/exclusive-skill-system.ts`：接入技能参数、连续位移、技能状态和安全落点。
- `src/server/simulation.ts`：接入状态效果、基础数值、技能倍率、治疗/净化/减伤和射击锁定。
- `src/server/host-admin.ts`：确认基础覆盖值与技能倍率叠加规则不变。
- `src/shared/protocol.ts`：如需传输状态边沿，只增加低频快照字段，不新增震动专用消息。
- `src/client/combat-feedback.ts`：从快照/击杀播报派生一次性本地反馈事件。
- `src/client/game-scene.ts`：订阅反馈事件、播放小幅视觉冲击和状态效果，不直接调用 `navigator.vibrate`。
- `src/client/mobile-app.ts`、`src/client/styles.css`：增加震动强度设置入口并保持安全区布局。
- `src/client/asset-registry.ts`：仅在缺少状态/技能视觉素材时补充已有风格资源引用。
- `tests/simulation.test.ts`、`tests/exclusive-skill-system.test.ts`、`tests/host-admin.test.ts`：补充权威战斗和房主覆盖回归。
- `tests/combat-feedback.test.ts`、`tests/mobile-skill.test.ts`：补充反馈边沿和移动端不遮挡回归。
- `package.json`、`package-lock.json`、`README.md`、`CHANGELOG.md`：发布时更新到 `4.5.0`。

### Task 1: 建立共享角色平衡配置

**Files:**
- Create: `src/shared/character-balance.ts`
- Modify: `src/shared/character-catalog.ts`
- Create: `tests/character-balance.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/character-balance.test.ts` 中断言六个 ID 的精确表格值：

```ts
expect(getCharacterBalance("blaze")).toMatchObject({ maxHealth: 104, damage: 24, fireCooldownMs: 600, moveSpeed: 272, projectileSpeed: 660 });
expect(getCharacterBalance("medic")).toMatchObject({ maxHealth: 108, damage: 18, fireCooldownMs: 560, moveSpeed: 255, projectileSpeed: 620 });
expect(getCharacterBalance("fortress")).toMatchObject({ maxHealth: 136, damage: 20, fireCooldownMs: 650, moveSpeed: 225, projectileSpeed: 570 });
expect(getCharacterBalance("arc")).toMatchObject({ maxHealth: 96, damage: 14, fireCooldownMs: 360, moveSpeed: 258, projectileSpeed: 680 });
expect(getCharacterBalance("phase")).toMatchObject({ maxHealth: 88, damage: 30, fireCooldownMs: 900, moveSpeed: 248, projectileSpeed: 880 });
expect(getCharacterBalance("runner")).toMatchObject({ maxHealth: 92, damage: 18, fireCooldownMs: 500, moveSpeed: 310, projectileSpeed: 650 });
```

同时断言每个条目的 `ttkReferenceMs`、`shotCountToDefeat100` 与设计文档一致。

- [ ] **Step 2: 运行确认测试按预期失败**

运行：`npm.cmd test -- --run --configLoader runner tests/character-balance.test.ts`

预期：因 `character-balance.ts` 不存在或导出缺失而失败。

- [ ] **Step 3: 实现最小共享配置**

导出 `CharacterBalance`、`CHARACTER_BALANCE`、`getCharacterBalance`；将 `character-catalog.ts` 的 `base` 和每个角色数值改为引用该配置，不复制数字。保留角色名称、颜色、被动和文案字段。

- [ ] **Step 4: 运行定向测试和已有目录测试**

运行：`npm.cmd test -- --run --configLoader runner tests/character-balance.test.ts tests/character-catalog.test.ts tests/asset-registry.test.ts`

预期：全部通过，角色选择仍能读取相同角色 ID 和素材。

- [ ] **Step 5: 提交**

```powershell
git add src/shared/character-balance.ts src/shared/character-catalog.ts tests/character-balance.test.ts
git commit -m "feat: centralize v4.5 character balance"
```

### Task 2: 建立专属技能参数和状态效果模块

**Files:**
- Create: `src/shared/exclusive-skill-balance.ts`
- Create: `src/server/status-effects.ts`
- Modify: `src/shared/exclusive-skill-catalog.ts`
- Create: `tests/status-effects.test.ts`
- Modify: `tests/exclusive-skill-system.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖：堡垒 45% 正面减伤/25% 队友保护/25% 射速压制；相位 400 距离、250ms 射击锁定、1200ms 显形；烈锋 340 距离、180ms 位移、5000ms 锚点；医师 28/34 治疗；电弧 0.70/1.15；疾行 1.28/1.15。

状态测试使用真实时间戳：添加同类型压制后刷新而非叠加，净化只移除可净化状态，死亡/复活清空，过期状态不可读。

- [ ] **Step 2: 运行确认测试失败**

运行：`npm.cmd test -- --run --configLoader runner tests/status-effects.test.ts tests/exclusive-skill-system.test.ts`

预期：新参数导出和状态 API 缺失导致失败。

- [ ] **Step 3: 实现配置与状态 API**

导出 `ExclusiveSkillBalance` 和按技能 ID 查询函数；状态模块导出 `StatusEffectId`、`StatusEffect`、`addStatusEffect`、`clearPurifiableStatus`、`expireStatusEffects`、`clearAllStatusEffects`、`hasActiveStatusEffect`。所有 API 接收 `now`，不使用 `Date.now()`。

- [ ] **Step 4: 运行定向测试**

运行同一组 Vitest 命令，预期全部通过。

- [ ] **Step 5: 提交**

```powershell
git add src/shared/exclusive-skill-balance.ts src/server/status-effects.ts src/shared/exclusive-skill-catalog.ts tests/status-effects.test.ts tests/exclusive-skill-system.test.ts
git commit -m "feat: define v4.5 skill counters and status effects"
```

### Task 3: 接入服务器权威战斗规则

**Files:**
- Modify: `src/server/exclusive-skill-system.ts`
- Modify: `src/server/simulation.ts`
- Modify: `src/shared/protocol.ts` only if a snapshot status field is required
- Modify: `tests/simulation.test.ts`
- Modify: `tests/exclusive-skill-system.test.ts`

- [ ] **Step 1: 写失败测试**

新增真实 `GameWorld` 测试：基础角色属性来自平衡配置；相位技能的 250ms 内不生成子弹；相位结束显形 1200ms；堡垒前方伤害为 55%、侧后方为 100%；团队队友保护为 75%；压制不叠加；医师个人战不治疗队友；疾行和电弧倍率以房主覆盖后的基础值计算。

- [ ] **Step 2: 运行确认失败**

运行：`npm.cmd test -- --run --configLoader runner tests/simulation.test.ts tests/exclusive-skill-system.test.ts`

预期：现有技能倍率、范围或状态字段与设计值不一致。

- [ ] **Step 3: 实现最小服务器接入**

让 `createGameWorld` 使用共享角色配置；让 `applyExclusiveSkill` 使用技能配置并保留安全落点；在 `damagePlayer`、`movePlayer`、`updateAimAndFire` 和治疗路径中读取状态模块；用 `moveCircleUntilBlocked` 或等价扫掠实现烈锋 180ms 的连续位移；相位设置射击锁定和显形时间戳。死亡、复活和换局调用状态清理。

- [ ] **Step 4: 运行服务器回归**

运行：`npm.cmd test -- --run --configLoader runner tests/simulation.test.ts tests/exclusive-skill-system.test.ts tests/collision.test.ts tests/room.test.ts`

预期：全部通过，穿墙次数回归为 0。

- [ ] **Step 5: 提交**

```powershell
git add src/server/exclusive-skill-system.ts src/server/simulation.ts src/shared/protocol.ts tests/simulation.test.ts tests/exclusive-skill-system.test.ts
git commit -m "feat: apply v4.5 authoritative combat rules"
```

### Task 4: 验证房主神器覆盖兼容

**Files:**
- Modify: `src/server/host-admin.ts` only if validation needs the shared range constants
- Modify: `tests/host-admin.test.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: 写失败回归测试**

验证房主覆盖伤害/移速/射击间隔/弹速后，疾行和电弧技能分别按 `1.15`、`0.70/1.15` 计算；验证覆盖专属技能冷却后仍在服务器应用并广播；验证强制获胜仍同步所有客户端。

- [ ] **Step 2: 运行确认失败或证明现有行为**

运行：`npm.cmd test -- --run --configLoader runner tests/host-admin.test.ts tests/simulation.test.ts`

若某条测试已通过，保留为回归并继续；若失败，记录失败来自参数叠加或广播顺序。

- [ ] **Step 3: 最小修复**

只调整房主覆盖与技能倍率的组合边界，不修改授权令牌、命令白名单或服务器确认顺序。

- [ ] **Step 4: 运行回归并提交**

运行同一组命令，预期全部通过；然后：

```powershell
git add src/server/host-admin.ts tests/host-admin.test.ts tests/simulation.test.ts
git commit -m "test: preserve host admin balance overrides"
```

### Task 5: 建立客户端战斗反馈事件管线

**Files:**
- Modify: `src/client/combat-feedback.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/combat-feedback.test.ts`

- [ ] **Step 1: 写失败测试**

测试快照边沿只生成一次 `hit`, `shield-hit`, `hurt`, `low-health`, `skill`, `exclusive-skill`, `kill`, `death`, `objective` 事件；相同快照重复渲染不重复生成；击杀事件按本地玩家 ID 过滤。

- [ ] **Step 2: 运行确认失败**

运行：`npm.cmd test -- --run --configLoader runner tests/combat-feedback.test.ts`

预期：新事件类型或事件派生函数缺失而失败。

- [ ] **Step 3: 实现标准事件边沿**

导出 `CombatFeedbackEvent` 和 `selectCombatFeedbackEvents(previous, next, localPlayerId)`；只使用快照状态边沿、动作确认和已有击杀播报，不发 Socket.IO 新消息；事件带稳定 `key` 供视觉和震动去重。

- [ ] **Step 4: 接入场景并回归**

在 `game-scene.ts` 的快照更新路径调用事件选择器，将视觉事件交给现有效果池；运行：`npm.cmd test -- --run --configLoader runner tests/combat-feedback.test.ts tests/combat-audio.test.ts tests/combat-feedback.test.ts`。

- [ ] **Step 5: 提交**

```powershell
git add src/client/combat-feedback.ts src/client/game-scene.ts tests/combat-feedback.test.ts
git commit -m "feat: derive deduplicated combat feedback events"
```

### Task 6: 实现 CombatHaptics 和移动端设置

**Files:**
- Create: `src/client/combat-haptics.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Create: `tests/combat-haptics.test.ts`
- Modify: `tests/mobile-skill.test.ts`

- [ ] **Step 1: 写失败测试**

用注入的 `vibrate(pattern)`、`now()` 和 `visibility()` 适配器测试：关闭/轻微/标准/强烈缩放；命中 90ms、受击 140ms 节流；事件 key 去重；死亡清空队列；后台调用 `vibrate(0)`；缺少 `navigator.vibrate` 时不抛错并返回 `supported=false`。

- [ ] **Step 2: 运行确认失败**

运行：`npm.cmd test -- --run --configLoader runner tests/combat-haptics.test.ts`

预期：模块和导出不存在而失败。

- [ ] **Step 3: 实现最小 haptics 模块**

导出 `HapticIntensity`、`CombatHapticsOptions`、`CombatHaptics`；事件模式表使用设计文档的固定序列；强度缩放后单段不超过 120ms、完整序列不超过 300ms；同类事件按时间节流并合并最新方向；`stop()` 清空所有待处理反馈。

- [ ] **Step 4: 接入设置和生命周期**

在移动端设置中新增四档选择，默认 `standard`，保存到现有本地设置机制；应用 `visibilitychange`、失焦、观战、返回大厅和关闭设置时调用 `stop()`；iPhone 仍显示视觉/声音反馈。

- [ ] **Step 5: 运行移动端回归并提交**

运行：`npm.cmd test -- --run --configLoader runner tests/combat-haptics.test.ts tests/mobile-skill.test.ts tests/mobile-layout.test.ts tests/touch-control-layout.test.ts`

预期：设置不遮挡攻击摇杆和技能按钮；然后：

```powershell
git add src/client/combat-haptics.ts src/client/mobile-app.ts src/client/styles.css tests/combat-haptics.test.ts tests/mobile-skill.test.ts
git commit -m "feat: add cross-device combat haptics"
```

### Task 7: 完成视觉反馈、角色说明和状态显示

**Files:**
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/character-preview.ts`
- Modify: `src/client/skill-effects.ts`
- Modify: `src/client/skill-indicator.ts`
- Modify: `tests/character-selection-ui.test.ts`
- Modify: `tests/skill-effects.test.ts`

- [ ] **Step 1: 写失败测试**

断言角色选择面板显示共享实际数值、专属技能参数和反制说明；技能状态显示相位显形、射击锁定、堡垒压制和医师净化；视觉冲击的最大幅度和持续时间不超过设计上限。

- [ ] **Step 2: 运行确认失败**

运行：`npm.cmd test -- --run --configLoader runner tests/character-selection-ui.test.ts tests/skill-effects.test.ts`

预期：缺少新参数展示和状态层而失败。

- [ ] **Step 3: 最小实现**

角色预览从共享目录读取数值；技能指示器读取共享技能参数；在不新增 UI 卡片层级的前提下给现有状态/按钮增加短文案和颜色区分；视觉冲击只调用已有对象池，沿用当前暗黑科幻像素风格。

- [ ] **Step 4: 运行定向测试并做浏览器视觉检查**

运行：`npm.cmd test -- --run --configLoader runner tests/character-selection-ui.test.ts tests/skill-effects.test.ts tests/mobile-layout.test.ts`；启动开发服务器后使用现有浏览器 QA 流程检查桌面、手机横屏、高 DPR、刘海安全区和技能/攻击摇杆不重叠。

- [ ] **Step 5: 提交**

```powershell
git add src/client/game-scene.ts src/client/character-preview.ts src/client/skill-effects.ts src/client/skill-indicator.ts tests/character-selection-ui.test.ts tests/skill-effects.test.ts
git commit -m "feat: expose balance counters and combat states"
```

### Task 8: 全量验证、压力测试与 v4.5.0 发布

**Files:**
- Modify: `tests/v4-load-test.test.ts`
- Modify: `tests/v3-load-test.test.ts` only if a shared assertion needs the new event budget
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 写失败/回归压力测试**

扩展六人压力场景覆盖个人战、3v3、2v2v2、据点 3v3、据点 2v2v2，记录服务器步进 P95、追帧次数、穿墙次数、状态残留、反馈事件重复和网络包频率不变。

- [ ] **Step 2: 运行压力测试**

运行：`npm.cmd run load-test:v4` 以及新增的模式矩阵命令；预期六人持续 60 秒无断线、无非法穿墙，诊断指标在当前预算内。

- [ ] **Step 3: 全量验证**

依次运行：

```powershell
npm.cmd test -- --run --configLoader runner
npm.cmd run typecheck
npm.cmd run build
npm.cmd run smoke:clean-clone
git diff --check
```

预期：所有测试通过、类型检查和生产构建退出码为 0、干净克隆报告 API 4.5.0 且运行时素材完整。

- [ ] **Step 4: 更新发布文档和版本**

将 `package.json`/`package-lock.json` 改为 `4.5.0`；在 README 顶部写明角色平衡、软反制、跨设备震动和不降画质原则；CHANGELOG 记录数值、状态、震动、测试和已知 iPhone 限制。

- [ ] **Step 5: 最终清洁检查并提交**

确认 `git status --short` 只包含预期发布文件，运行全量验证命令一次；然后：

```powershell
git add src tests package.json package-lock.json README.md CHANGELOG.md
git commit -m "feat: release v4.5.0 combat balance and haptics"
```

- [ ] **Step 6: 推送并验证 Clean clone**

使用已配置代理执行：

```powershell
git push origin HEAD:main
```

打开公开 `Clean clone` Actions 运行页面，确认 Windows 与 Ubuntu 两个任务都成功；失败时先读取具体任务日志，不能只根据本地测试结果宣称发布成功。

## 计划自检清单

- [x] 设计文档中的六名角色数值均有 Task 1 和 Task 3 覆盖。
- [x] 六套技能的距离、时间、倍率、反制和状态清理均有 Task 2、Task 3 覆盖。
- [x] 震动兼容、节流、强度、后台停止和不新增网络频率均有 Task 5、Task 6 覆盖。
- [x] 房主神器兼容与强制获胜回归有 Task 4 覆盖。
- [x] 视觉审查、最高画质、手机安全区和摇杆布局有 Task 7 覆盖。
- [x] 全量测试、构建、干净克隆和 GitHub Actions 有 Task 8 覆盖。
- [x] 文档无未决占位符或未定义的实施步骤。
