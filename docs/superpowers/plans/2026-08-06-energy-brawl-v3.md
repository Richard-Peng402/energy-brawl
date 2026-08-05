# 能量乱斗 v3.0 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 保留 v2.0 的服务器权威 60 Hz 模拟和 30/20 Hz 快照，交付扩大地图与视野、六名角色、授权科幻美术、四种技能、统一手机触控和仅服务器电脑可用的房主神器。

**Architecture:** 角色、技能、触控、视口、素材和管理命令拆成独立模块。胜负相关状态只在服务器改变；技能与房主命令排入队列，在固定模拟步之间执行。客户端只负责输入、预测、插值、UI 和对象池特效。

**Tech Stack:** TypeScript、Node.js、Express、Socket.IO、Phaser 3、Vite、Vitest、Pointer Events、Fullscreen API

---

## 工作树保护

以下未提交的局域网端口修复必须保留且不得混入 v3.0 提交：

    M src/server/index.ts
    ?? src/server/lan-address.ts
    ?? src/server/port.ts
    ?? tests/lan-address.test.ts
    ?? tests/server-port.test.ts

每次提交前运行 git status --short 和 git diff --cached --name-only。

## 文件图

新建：

- src/shared/character-catalog.ts
- src/shared/skill-catalog.ts
- src/client/touch-router.ts
- src/client/mobile-viewport.ts
- src/client/asset-registry.ts
- src/client/effect-pool.ts
- src/server/skill-system.ts
- src/server/host-admin.ts
- scripts/import-v3-assets.mjs
- scripts/v3-load-test.ts
- THIRD_PARTY_ASSETS.md
- tests/character-catalog.test.ts
- tests/touch-router.test.ts
- tests/mobile-viewport.test.ts
- tests/asset-registry.test.ts
- tests/skill-system.test.ts
- tests/host-admin.test.ts
- tests/v3-load-test.test.ts

修改 package.json、index.html、shared constants/protocol/collision、server simulation/room/bot/network、client network/mobile-app/game-scene/styles 和相关现有测试。

---

# 里程碑一：地图、视野与手机输入

### Task 1: 基线和地图缩放

**Files:** src/shared/constants.ts、tests/spawn-layout.test.ts、tests/simulation.test.ts

- [ ] 运行基线：

    npm.cmd test -- --run
    npm.cmd run typecheck
    npm.cmd run build

预期：现有 101 项测试、类型检查和构建全部通过。

- [ ] 写失败测试：

    expect(ARENA_WIDTH).toBe(2_880);
    expect(ARENA_HEIGHT).toBe(1_620);
    expect(VIEW_WIDTH).toBe(1_536);
    expect(VIEW_HEIGHT).toBe(864);

逐项验证 SPAWN_POINTS、ENERGY_SPAWN_POINTS、WALLS 为 v2 数值乘 4 / 3；PLAYER_RADIUS、PLAYER_SPEED、PROJECTILE_RADIUS、PROJECTILE_SPEED 不缩放。

- [ ] 运行 RED：

    npm.cmd test -- --run tests/spawn-layout.test.ts tests/simulation.test.ts

- [ ] 最小实现：

    export const ARENA_SCALE = 4 / 3;
    export const ARENA_WIDTH = 2_880;
    export const ARENA_HEIGHT = 1_620;
    export const VIEW_WIDTH = 1_536;
    export const VIEW_HEIGHT = 864;

不得改变墙体数量、通道和拓扑。

- [ ] 运行 GREEN 和提交：

    npm.cmd test -- --run tests/spawn-layout.test.ts tests/simulation.test.ts tests/collision.test.ts
    npm.cmd test -- --run
    git add src/shared/constants.ts tests/spawn-layout.test.ts tests/simulation.test.ts
    git commit -m "feat: enlarge v3 arena and camera"

### Task 2: 动态视口和统一 TouchRouter

**Files:** 新建 src/client/mobile-viewport.ts、src/client/touch-router.ts、tests/mobile-viewport.test.ts、tests/touch-router.test.ts；修改 index.html、src/client/virtual-stick.ts、src/client/mobile-app.ts、src/client/styles.css、tests/virtual-stick.test.ts

- [ ] 写失败测试，锁定接口：

    export class MobileViewport {
      start(): void;
      stop(): void;
      requestFullscreen(): Promise<boolean>;
      subscribe(listener: (state: ViewportState) => void): () => void;
    }

    export type TouchRole = "move" | "aim" | "skill";

    export class TouchRouter {
      pointerDown(event: PointerEvent, skillTarget: boolean): TouchRole | null;
      pointerMove(event: PointerEvent): TouchRole | null;
      pointerUp(pointerId: number): void;
      resetAll(): void;
      owner(pointerId: number): TouchRole | null;
    }

覆盖 visualViewport 优先、Fullscreen API 缺失不抛错、左半屏 move、右半屏 aim、aim 跨中线保持所有权、技能按钮优先、取消/失焦/旋转/全屏变化后归零。

- [ ] 运行 RED：

    npm.cmd test -- --run tests/mobile-viewport.test.ts tests/touch-router.test.ts tests/virtual-stick.test.ts

- [ ] 最小实现：页面使用 100dvw、100dvh、viewport-fit=cover 和安全区变量。VirtualStick 改为 begin/move/end/reset API。MobileApp 只在 arena-screen 绑定一组 pointer 事件；技能按钮固定在中线下方。

- [ ] 验收 844 × 390、932 × 430、667 × 375。确认右半屏任意空白可攻击、跨中线不断开、失焦后下一包 firing=false。

- [ ] 验证和提交：

    npm.cmd test -- --run
    npm.cmd run typecheck
    npm.cmd run build
    git add index.html src/client/mobile-viewport.ts src/client/touch-router.ts src/client/virtual-stick.ts src/client/mobile-app.ts src/client/styles.css tests/mobile-viewport.test.ts tests/touch-router.test.ts tests/virtual-stick.test.ts
    git commit -m "feat: add v3 mobile viewport and touch routing"

---

# 里程碑二：角色、美术与被动

### Task 3: 六角色目录和服务器动态属性

**Files:** 新建 src/shared/character-catalog.ts、tests/character-catalog.test.ts；修改 src/shared/protocol.ts、src/server/room.ts、src/server/simulation.ts、tests/room.test.ts、tests/simulation.test.ts

- [ ] 定义：

    export type CharacterId =
      | "blaze" | "medic" | "fortress"
      | "arc" | "phase" | "runner";

    export interface CharacterDefinition {
      id: CharacterId;
      name: string;
      color: string;
      role: string;
      passiveName: string;
      passiveDescription: string;
      advantage: string;
      tradeoff: string;
      maxHealth: number;
      damage: number;
      moveSpeed: number;
      fireCooldownMs: number;
      projectileSpeed: number;
    }

- [ ] 失败测试锁定：烈锋 94 生命/27 伤害；医师 23 伤害且能量球治疗 12；堡垒 112 生命/252 移速；电弧 23 伤害/415 ms；相位 700 弹速/490 ms；疾行者 92 生命/282 移速。

- [ ] Room 测试：JoinPayload 使用 characterId；真人角色不可重复；AI 只填剩余角色；重连恢复原角色。颜色由目录推导，不接受客户端自定义。

- [ ] Simulation 测试：移动、射击、复活和伤害使用玩家动态字段；医师治疗不超过 maxHealth。

- [ ] 验证和提交：

    npm.cmd test -- --run tests/character-catalog.test.ts tests/room.test.ts tests/simulation.test.ts
    npm.cmd test -- --run
    git add src/shared/character-catalog.ts src/shared/protocol.ts src/server/room.ts src/server/simulation.ts tests/character-catalog.test.ts tests/room.test.ts tests/simulation.test.ts
    git commit -m "feat: add six v3 characters"

### Task 4: 授权素材流水线和许可证

**Files:** 新建 scripts/import-v3-assets.mjs、src/client/asset-registry.ts、tests/asset-registry.test.ts、THIRD_PARTY_ASSETS.md、public/assets/v3；修改 package.json

- [ ] 失败测试要求六角色都有 portrait/idle/move/attack/hit/death/fallback，地图有 floor/wall/decal/light，四技能都有图标，路径均位于 /assets/v3/。

- [ ] 固定来源：

    https://opengameart.org/content/top-down-sci-fi-shooter-characters-20
    https://opengameart.org/content/top-down-sci-fi-shooter-pack
    https://opengameart.org/content/top-down-sci-fi-shooter-some-random-guys-terrain-texture
    https://kenney.nl/assets/top-down-shooter

导入 manifest 每项必须有 source、author、license、sourceUrl、outputFiles；单张纹理不超过 2048 × 2048；大厅立绘与战斗图集分离；首次大厅压缩资源不超过 8 MB。

- [ ] THIRD_PARTY_ASSETS.md 记录作者、URL、许可证、本地文件、修改内容和游戏内署名。Tatermand 为 CC-BY-SA 3.0，Kenney 为 CC0；来源不清的素材拒绝导入。

- [ ] package.json 增加：

    "assets:v3": "node scripts/import-v3-assets.mjs"

- [ ] 验证和提交：

    npm.cmd run assets:v3
    npm.cmd test -- --run tests/asset-registry.test.ts
    npm.cmd run build
    git add package.json scripts/import-v3-assets.mjs src/client/asset-registry.ts tests/asset-registry.test.ts THIRD_PARTY_ASSETS.md public/assets/v3
    git commit -m "feat: add licensed v3 art pipeline"

### Task 5: 角色渲染、地图美术和选择说明

**Files:** 新建 src/client/effect-pool.ts；修改 src/client/game-scene.ts、src/client/mobile-app.ts、src/client/network.ts、src/client/styles.css、tests/network.test.ts

- [ ] 失败测试：资源失败时使用角色颜色 fallback；对象池容量固定并复用；角色详情从 CharacterCatalog 显示真实人物、被动、优势、代价和精确数值。

- [ ] GameRenderer 用 Sprite 替换圆形身体，支持 idle/move/attack/hit/death。地图装饰只做非碰撞层，WALLS 仍是唯一墙体依据。枪口焰、尾迹、命中、护盾、冲刺、治疗、复活全部进入对象池。

- [ ] 大厅显示六张角色卡；真人已占用角色禁用，AI 不在开局前锁定真人选择。

- [ ] 低性能模式只降低环境粒子、阴影和装饰动画，不隐藏命中、技能球、护盾或粗攻击走廊。

- [ ] 全量验证和提交：

    npm.cmd test -- --run
    npm.cmd run typecheck
    npm.cmd run build
    git add src/client/effect-pool.ts src/client/game-scene.ts src/client/mobile-app.ts src/client/network.ts src/client/styles.css tests/network.test.ts
    git commit -m "feat: render v3 characters and arena"

---

# 里程碑三：技能球与技能

### Task 6: 技能球、单技能槽和动作序号

**Files:** 新建 src/shared/skill-catalog.ts、src/server/skill-system.ts、tests/skill-system.test.ts；修改 src/shared/protocol.ts、src/shared/constants.ts、src/server/simulation.ts、src/server/room.ts、src/server/network.ts、src/client/network.ts、tests/network.test.ts

- [ ] 定义：

    export type SkillType = "dash" | "shield" | "spread" | "heal";

    export interface SkillOrbSnapshot extends Vec2 {
      id: string;
      type: SkillType;
    }

    export interface SkillSlotSnapshot {
      type: SkillType | null;
      charges: 0 | 1;
    }

- [ ] 失败测试：最多 3 球；每 10–14 秒补一个；四种轮换池耗尽前各出现一次；只在安全点；拾取不加分；新技能替换旧技能；死亡清空、正常重连保留、踢出接管清空。

- [ ] useSkill 携带单调递增 skillActionSeq。拒绝重复、倒退、非安全整数和异常跳跃。Socket 回调只入队，不直接改世界。

- [ ] 验证和提交：

    npm.cmd test -- --run tests/skill-system.test.ts tests/network.test.ts tests/room.test.ts
    git add src/shared/skill-catalog.ts src/server/skill-system.ts src/shared/protocol.ts src/shared/constants.ts src/server/simulation.ts src/server/room.ts src/server/network.ts src/client/network.ts tests/skill-system.test.ts tests/network.test.ts
    git commit -m "feat: add v3 skill orb model"

### Task 7: 四种技能和不穿墙保证

**Files:** 修改 src/shared/collision.ts、src/server/skill-system.ts、src/server/simulation.ts、tests/skill-system.test.ts、tests/collision.test.ts、tests/simulation.test.ts

- [ ] 冲刺失败测试：约 260 单位；移动方向优先、瞄准回退、无方向不消费；连续扫掠停在第一处墙或边界，不穿墙、不穿玩家、不无敌。

- [ ] 护盾测试：4 秒或吸收 50，先扣盾，溢出伤害扣生命。

- [ ] 散射测试：-12°/0°/+12°，每枚 18 伤害，仍使用墙优先连续子弹碰撞。

- [ ] 治疗测试：恢复 35，不超过 maxHealth；满血拒绝且不消费。

- [ ] 验证：

    npm.cmd test -- --run tests/skill-system.test.ts tests/collision.test.ts tests/simulation.test.ts
    npm.cmd test -- --run

- [ ] 提交：

    git add src/shared/collision.ts src/server/skill-system.ts src/server/simulation.ts tests/skill-system.test.ts tests/collision.test.ts tests/simulation.test.ts
    git commit -m "feat: implement four v3 skills"

### Task 8: AI 技能和手机技能 HUD

**Files:** 修改 src/server/bot.ts、src/server/room.ts、src/client/mobile-app.ts、src/client/game-scene.ts、src/client/styles.css、tests/bot.test.ts、tests/touch-router.test.ts

- [ ] AI 测试：低血治疗、受威胁护盾、近敌追击时合法冲刺、射程内散射；逃生权重大于技能球，技能球大于远处普通能量；决策间隔保持 300–450 ms。

- [ ] BotDecision 同时返回 input 和 useSkill，不新增高频 AI 定时器。

- [ ] 手机按钮空槽弱化，有技能时显示图标和“一次”；按下只增加一次序号，不创建 aim。技能球显示类型颜色、图标、光柱和地面标记。

- [ ] 三种横屏尺寸确认按钮不挡攻击区，特效不遮挡角色、墙体、技能球和攻击走廊。

- [ ] 全量验证和提交：

    npm.cmd test -- --run
    npm.cmd run typecheck
    npm.cmd run build
    git add src/server/bot.ts src/server/room.ts src/client/mobile-app.ts src/client/game-scene.ts src/client/styles.css tests/bot.test.ts tests/touch-router.test.ts
    git commit -m "feat: add ai and mobile skill play"

---

# 里程碑四：房主神器与压力测试

### Task 9: 安全主机命令队列和静默日志

**Files:** 新建 src/server/host-admin.ts、tests/host-admin.test.ts；修改 src/shared/protocol.ts、src/server/network.ts、src/server/room.ts

- [ ] 定义：

    export type HostAdminCommand =
      | { type: "setStat"; playerId: string; stat: AdminStat; value: number }
      | { type: "kick"; playerId: string }
      | { type: "forceWinner"; playerId: string };

    export type AdminStat =
      | "health" | "maxHealth" | "damage"
      | "score" | "moveSpeed" | "fireCooldownMs";

- [ ] 测试必须同时满足环回来源、正确随机令牌、合法命令/目标/阶段。支持 127.0.0.1、::1 和 IPv4 映射环回；局域网手机即使知道令牌也拒绝。

- [ ] HostAdminService 提供 enqueue、drain、getLogs；队列上限 128；日志环形缓冲最近 200 条；Room.tick 在 stepWorld 前 drain。

- [ ] 范围：health/maxHealth 1..500，damage 0..200，score 0..99，moveSpeed 50..600，fireCooldownMs 100..2000。maxHealth 下调同步压低 health；score 修改后正常重算领先者和 15 分倒计时。

- [ ] 验证和提交：

    npm.cmd test -- --run tests/host-admin.test.ts tests/network.test.ts tests/room.test.ts
    git add src/server/host-admin.ts src/shared/protocol.ts src/server/network.ts src/server/room.ts tests/host-admin.test.ts tests/network.test.ts
    git commit -m "feat: queue secure host admin commands"

### Task 10: 踢人、强制获胜和主机界面

**Files:** 修改 src/server/host-admin.ts、src/server/room.ts、src/server/simulation.ts、src/client/host-app.ts、src/client/network.ts、src/client/styles.css、tests/host-admin.test.ts、tests/room.test.ts、tests/host-state.test.ts

- [ ] 踢真人测试：立即断开、技能清空、本局令牌封禁、普通 AI 接管原席；下一局解除。踢 AI：本局移除且不补齐，下一局恢复。forceWinner 复用正常结算和回大厅流程。

- [ ] 主机页显示六席角色、真人/AI、连接、生命、最大生命、伤害、积分、移速、射击间隔；支持预设与安全范围手输；踢出和强制获胜二次确认。

- [ ] 手机无管理入口和通知。服务器标准输出与最近 200 条日志记录时间、命令、目标、结果、修改前后值。

- [ ] 验证本机正确令牌成功、局域网来源和伪造令牌失败。

- [ ] 验证和提交：

    npm.cmd test -- --run tests/host-admin.test.ts tests/room.test.ts tests/host-state.test.ts
    npm.cmd run typecheck
    npm.cmd run build
    git add src/server/host-admin.ts src/server/room.ts src/server/simulation.ts src/client/host-app.ts src/client/network.ts src/client/styles.css tests/host-admin.test.ts tests/room.test.ts tests/host-state.test.ts
    git commit -m "feat: add local host admin console"

### Task 11: 六客户端耐久测试

**Files:** 新建 scripts/v3-load-test.ts、tests/v3-load-test.test.ts；修改 package.json、scripts/load-test.ts

- [ ] 脚本覆盖六客户端、至少 600 秒、至少两局、移动、射击、普通能量、四技能、数值修改、踢人接管、踢 AI、强制获胜。

- [ ] 报告包含 clients、matchesStarted、matchesFinished、snapshotCounts、maxSnapshotGapMs、skillUsesByType、adminCommands、wallViolationCount、rssStart、rssEnd、simulationP95Ms。长期断快照、未跨两局、技能未覆盖、管理失败或穿墙时退出码 1。

- [ ] package.json 增加：

    "load-test:v3": "tsx scripts/v3-load-test.ts"

- [ ] 验证和提交：

    npm.cmd test -- --run tests/v3-load-test.test.ts
    npm.cmd run typecheck
    git add package.json scripts/v3-load-test.ts scripts/load-test.ts tests/v3-load-test.test.ts
    git commit -m "test: add v3 multiplayer endurance test"

### Task 12: 完整发布验收

- [ ] 运行：

    npm.cmd test -- --run
    npm.cmd run typecheck
    npm.cmd run build
    npm.cmd run load-test:v3

- [ ] Android Chrome、iPhone Safari 和 844 × 390、932 × 430、667 × 375 验收：全屏、双摇杆、技能、HUD、死亡、结算、手动/自动回大厅、重连、60 FPS 目标、P95 帧耗时不超过 20 ms。

- [ ] 子弹和冲刺的 wallViolationCount 必须为 0；六客户端持续收包，无追帧风暴和无界内存增长。

- [ ] package.json 更新为 3.0.0，再运行测试、类型检查和构建。

- [ ] 最终提交前确认暂存区不含五个端口修复文件：

    git status --short
    git diff --cached --name-only
    git commit -m "release: energy brawl v3.0"

---

## 停止条件与自检

出现任一情况即停止进入下一里程碑：既有 101 项回归失败；类型检查或构建失败；子弹/冲刺穿墙；触控在失焦、旋转、全屏变化后未归零；非环回地址可执行主机命令；素材缺少作者、来源或许可证；六客户端长期停顿、持续掉帧或无界内存增长。

规格覆盖已检查：地图、视野、全屏、触控、六角色、角色说明、授权素材、地图美术、四技能、AI、房主神器、静默日志和六客户端测试均有任务。计划不含未定占位语。CharacterId、SkillType、SkillSlotSnapshot、HostAdminCommand、AdminStat、skillActionSeq 命名一致。
