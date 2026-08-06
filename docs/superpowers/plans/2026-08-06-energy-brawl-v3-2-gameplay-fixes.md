# Energy Brawl v3.2 Gameplay Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让房主神器在大厅和对局内可靠生效，加入可感知的脱战回血，削弱 AI，并让手机镜头持续居中且在复活和地图边缘不丢失人物。

**Architecture:** 服务端继续作为唯一权威源，但把房主命令从“先 ACK 后排队”改成“验证、同步应用、再 ACK 和广播”。大厅席位保存下一局属性覆盖；战斗世界新增私有脱战时间状态；Phaser 相机直接跟随本地预测坐标并使用动态扩展边界。

**Tech Stack:** TypeScript、Socket.IO、Phaser 3、Vitest、Vite。

---

### Task 1: 大厅属性预设模型

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/server/simulation.ts`
- Modify: `src/server/room.ts`
- Modify: `tests/simulation.test.ts`
- Modify: `tests/room.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/simulation.test.ts` 断言 `createGameWorld` 应用 `stats` 覆盖，并在生命高于最大生命时保持合法；在 `tests/room.test.ts` 断言大厅快照显示角色基础值和覆盖后的预览值。

```ts
const world = createGameWorld([{ id: "p", nickname: "P", characterId: "blaze", isBot: false, stats: {
  health: 180, maxHealth: 180, damage: 80, score: 9, moveSpeed: 400, fireCooldownMs: 180,
} }]);
expect(world.players.get("p")).toMatchObject({ health: 180, maxHealth: 180, damage: 80, score: 9, moveSpeed: 400, fireCooldownMs: 180 });
```

- [ ] **Step 2: 验证红灯**

Run: `npm test -- --run tests/simulation.test.ts tests/room.test.ts`

Expected: FAIL，因为 `PlayerSeed` 尚不接受 `stats`，大厅快照也没有可编辑属性。

- [ ] **Step 3: 最小实现**

在协议中导出 `AdminStats = Pick<PlayerSnapshot, AdminStat>`；让大厅玩家快照包含六项可编辑数值和 `pendingWinnerId`。为 `PlayerSeed`/`RoomSeat` 增加 `stats?: Partial<AdminStats>`，创建世界时按以下顺序解析：角色基础值 → 大厅覆盖 → 生命/最大生命合法化。

```ts
const maxHealth = Math.max(seed.stats?.maxHealth ?? character.maxHealth, seed.stats?.health ?? 0);
const health = Math.min(seed.stats?.health ?? maxHealth, maxHealth);
```

- [ ] **Step 4: 验证绿灯**

Run: `npm test -- --run tests/simulation.test.ts tests/room.test.ts`

Expected: PASS。

### Task 2: 同步且可在大厅使用的房主神器

**Files:**
- Modify: `src/server/host-admin.ts`
- Modify: `src/server/room.ts`
- Modify: `src/server/network.ts`
- Modify: `src/client/host-app.ts`
- Modify: `tests/host-admin.test.ts`
- Modify: `tests/room.test.ts`
- Modify: `tests/network.test.ts`
- Modify: `tests/host-state.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖四条行为：大厅改数值立即反映在 `room.snapshot()`；大厅踢人删除席位并产生待断开 socket；大厅强制获胜写入 `pendingWinnerId` 并在开局后结束；Socket.IO ACK 返回时房间或世界状态已经改变且收到可靠快照。

```ts
const applied = room.applyHostAdminCommand({ type: "setStat", playerId, stat: "damage", value: 80 });
expect(applied.ok).toBe(true);
expect(room.snapshot().players.find((p) => p.id === playerId)?.damage).toBe(80);
```

- [ ] **Step 2: 验证红灯**

Run: `npm test -- --run tests/host-admin.test.ts tests/room.test.ts tests/network.test.ts tests/host-state.test.ts`

Expected: FAIL，因为大厅被拒绝、`applyHostAdminCommand` 非公开且网络 ACK 只代表排队。

- [ ] **Step 3: 最小实现**

将 `HostAdminService` 收敛为认证、范围验证和日志记录；`GameRoom.applyHostAdminCommand` 同步处理大厅/对局。网络处理器按“验证 → 应用 → ACK → 可靠广播”执行，不再维护管理命令队列。

```ts
const authorization = hostAdmin.authorize(request, room.hasPlayer(command.playerId), room.snapshot().phase);
const result = authorization.ok ? room.applyHostAdminCommand(command) : authorization;
sendAcknowledgement(acknowledge, result);
if (result.ok) { broadcastRoom(); broadcastGameTransition(); }
```

大厅 `setStat` 写入 `seat.stats`；大厅 `kick` 删除席位；大厅 `forceWinner` 设置 `pendingWinnerId`。对局内继续修改活动 `WorldPlayer`、AI 接管或调用 `forceWorldWinner`。

- [ ] **Step 4: 更新房主 UI**

大厅和对局均显示按钮与有效数值；成功消息使用“房主命令已生效”。大厅预设胜者增加明确标记，强制获胜确认文案说明会在下一局开局后立即结算。

- [ ] **Step 5: 验证绿灯**

Run: `npm test -- --run tests/host-admin.test.ts tests/room.test.ts tests/network.test.ts tests/host-state.test.ts`

Expected: PASS。

### Task 3: 脱战回血与治疗反馈

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/server/simulation.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: 写失败测试**

新增测试证明 5 秒内不回血、之后每秒恢复 8 点、攻击者和受击者同时进入战斗、再次受伤重置计时、死亡不回血、复活满血并重置计时。

```ts
damagePlayer(world, victim.id, attacker.id, 40);
stepWorld(world, 4_999);
expect(victim.health).toBe(victim.maxHealth - 40);
stepWorld(world, 1_001);
expect(victim.health).toBe(victim.maxHealth - 32);
```

- [ ] **Step 2: 验证红灯**

Run: `npm test -- --run tests/simulation.test.ts`

Expected: FAIL，生命值不会随脱战时间恢复。

- [ ] **Step 3: 最小实现**

增加 `COMBAT_REGEN_DELAY_MS = 5_000`、`COMBAT_REGEN_PER_SECOND = 8`。`WorldPlayer` 新增不进入快照的 `lastCombatAt` 和 `regenAccumulatorMs`；有效伤害更新双方时间并清空累计；`stepWorld` 在伤害结算后按 125ms/点的整数步进恢复生命。

```ts
const points = Math.floor(player.regenAccumulatorMs / (1_000 / COMBAT_REGEN_PER_SECOND));
player.health = Math.min(player.maxHealth, player.health + points);
```

- [ ] **Step 4: 增加玩家反馈**

满血且持有治疗技能时，客户端点击显示“生命已满”，不发送动作；持续回血特效以 500ms 节流，HUD 生命显示使用整数。

- [ ] **Step 5: 验证绿灯**

Run: `npm test -- --run tests/simulation.test.ts tests/effect-pool.test.ts`

Expected: PASS。

### Task 4: 降低 AI 强度

**Files:**
- Modify: `src/server/bot.ts`
- Modify: `src/server/room.ts`
- Modify: `tests/bot.test.ts`
- Modify: `tests/room.test.ts`

- [ ] **Step 1: 写失败测试**

断言移动向量长度约 0.75、420 以外不射击、最大瞄准误差约 26 度、合适窗口下仍可能因概率不使用技能，并验证房间下一次思考时间至少为 500ms。

```ts
const decision = chooseBotDecision(world, bot.id, () => 1);
expect(Math.hypot(decision.input.moveX, decision.input.moveY)).toBeCloseTo(0.75, 4);
expect(decision.useSkill).toBe(false);
```

- [ ] **Step 2: 验证红灯**

Run: `npm test -- --run tests/bot.test.ts tests/room.test.ts`

Expected: FAIL，当前 AI 满速、反应更快且技能必用。

- [ ] **Step 3: 最小实现**

将移动缩放为 0.75、射击距离改为 420、瞄准误差范围改为 ±0.45 弧度、技能使用概率设为 0.45；房间思考间隔改为 `500 + Math.random() * 250`。

- [ ] **Step 4: 验证绿灯**

Run: `npm test -- --run tests/bot.test.ts tests/room.test.ts`

Expected: PASS。

### Task 5: 连续居中、复活与边界镜头

**Files:**
- Modify: `src/client/camera-follow.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/camera-follow.test.ts`
- Modify: `tests/spawn-layout.test.ts`

- [ ] **Step 1: 写失败测试**

移除死区测试，改为断言普通帧中心等于人物坐标，视口边界从负半视口扩展到地图外半视口，四角人物仍可保持居中。

```ts
expect(resolveCameraView({ x: 27, y: 27 }, { width: 900, height: 500 }, { width: 2_880, height: 1_620 })).toEqual({
  center: { x: 27, y: 27 },
  bounds: { x: -450, y: -250, width: 3_780, height: 2_120 },
});
```

- [ ] **Step 2: 验证红灯**

Run: `npm test -- --run tests/camera-follow.test.ts tests/spawn-layout.test.ts`

Expected: FAIL，当前相机有死区并夹在地图内部。

- [ ] **Step 3: 最小实现**

用纯函数 `resolveCameraView` 生成动态相机中心和扩展 bounds；`ArenaScene.updateCamera` 每帧调用 `camera.setBounds(...)` 与 `camera.centerOn(localView.x, localView.y)`。在 `syncSnapshot` 检测本地玩家复活并在同一帧把人物容器和相机对准权威出生点。

- [ ] **Step 4: 绘制外围缓冲区**

在可玩地图外绘制深色外围地面、边界警示带和地图轮廓，覆盖至少 `VIEW_WIDTH` 的四周显示范围，不添加碰撞体。

- [ ] **Step 5: 验证绿灯**

Run: `npm test -- --run tests/camera-follow.test.ts tests/spawn-layout.test.ts`

Expected: PASS。

### Task 6: v3.2 版本与完整 QA

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] **Step 1: 更新版本与说明**

把版本号更新为 `3.2.0`，README 写明大厅神器、5 秒脱战回血、弱化 AI 与连续居中镜头。

- [ ] **Step 2: 完整自动验证**

Run: `npm test -- --run`

Expected: 所有测试通过。

Run: `npm run typecheck`

Expected: exit 0。

Run: `npm run build`

Expected: exit 0。

Run: `npm run load-test:v3 -- --seconds=60 --clients=6`

Expected: 六客户端完成，管理命令和技能动作大于 0，`wallViolations` 为 0。

- [ ] **Step 3: 浏览器验收**

在 `844×390` 手机横屏完成：加入/准备/开局、大厅改伤害并确认开局值、脱战 5 秒后回血、死亡复活镜头、移动到四边仍完整显示人物；检查页面身份、非空白、无框架错误、无相关 console error/warn，并保存截图到仓库外临时目录。

- [ ] **Step 4: 精确提交**

仅暂存 v3.2 文件，排除 `src/server/index.ts`、`src/server/lan-address.ts`、`src/server/port.ts`、`tests/lan-address.test.ts`、`tests/server-port.test.ts`。

```powershell
git diff --cached --name-only
git diff --cached --check
git commit -m "fix: release energy brawl v3.2"
```
