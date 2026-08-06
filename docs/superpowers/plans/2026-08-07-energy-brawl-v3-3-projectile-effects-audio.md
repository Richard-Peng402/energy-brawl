# Energy Brawl v3.3 Projectile Effects and Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为六人手机横屏对战加入强烈但受控的街机风子弹、发射/命中反馈和四类关键音效，同时保持服务器协议、战斗规则与顺滑镜头不变。

**Architecture:** 服务端继续作为唯一战斗权威，客户端从连续快照中的弹丸生命周期、玩家生命和技能槽变化推导纯表现事件。纯逻辑放在独立模块中接受 Vitest 验证；Phaser 场景只负责借用/回收预分配对象并播放视觉效果，`CombatAudio` 负责音频解锁、限流、合成和静音状态。

**Tech Stack:** TypeScript、Phaser 3、Web Audio API、Vitest、Vite、Socket.IO

---

## 文件结构

- Create: `src/client/combat-feedback.ts` — 弹丸方向、拖尾采样和技能拾取的纯逻辑。
- Create: `src/client/combat-audio.ts` — 四类程序音效、限流、音频解锁与静音持久化。
- Create: `tests/combat-feedback.test.ts` — 弹丸反馈和拾取判断测试。
- Create: `tests/combat-audio.test.ts` — 音效策略、限流和静音状态测试。
- Modify: `src/client/effect-pool.ts` — 增加可归还的固定容量池，并把次要火花标记为可降级效果。
- Modify: `src/client/game-scene.ts` — 三层子弹、持续拖尾、枪口闪光、消散爆裂与关键音效触发。
- Modify: `src/client/mobile-app.ts` — 共享音频控制器、首次手势解锁、技能拾取音和声音开关。
- Modify: `src/client/styles.css` — 横屏大厅与 HUD 的紧凑声音按钮。
- Modify: `tests/effect-pool.test.ts` — 可归还池和低性能火花降级测试。
- Create: `tests/mobile-audio-ui.test.ts` — 声音按钮和移动端样式结构测试。
- Modify: `package.json`, `package-lock.json`, `README.md` — 发布 `3.3.0` 并记录范围。

### Task 1: 可测试的弹丸反馈逻辑与固定容量租借池

**Files:**
- Create: `src/client/combat-feedback.ts`
- Create: `tests/combat-feedback.test.ts`
- Modify: `src/client/effect-pool.ts`
- Modify: `tests/effect-pool.test.ts`

- [ ] **Step 1: 写弹丸反馈失败测试**

在 `tests/combat-feedback.test.ts` 写入：

```ts
import { describe, expect, it } from "vitest";
import {
  didPickUpLocalSkill,
  projectileAngle,
  shouldEmitProjectileTrail,
  trailIntervalMs,
} from "../src/client/combat-feedback";

describe("v3.3 projectile feedback", () => {
  it("aims the arcade projectile along its velocity", () => {
    expect(projectileAngle({ x: 0, y: 12 })).toBeCloseTo(Math.PI / 2);
    expect(projectileAngle({ x: -9, y: 0 })).toBeCloseTo(Math.PI);
  });

  it("samples trails only after both the time and distance thresholds", () => {
    const memory = { x: 100, y: 100, emittedAt: 1_000 };
    expect(shouldEmitProjectileTrail(memory, { x: 120, y: 100 }, 1_020, false)).toBe(false);
    expect(shouldEmitProjectileTrail(memory, { x: 108, y: 100 }, 1_050, false)).toBe(false);
    expect(shouldEmitProjectileTrail(memory, { x: 120, y: 100 }, 1_050, false)).toBe(true);
  });

  it("halves trail sampling frequency in reduced mode", () => {
    expect(trailIntervalMs(false)).toBe(34);
    expect(trailIntervalMs(true)).toBe(67);
  });

  it("recognizes only an observed empty-to-filled skill transition", () => {
    expect(didPickUpLocalSkill(undefined, "dash")).toBe(false);
    expect(didPickUpLocalSkill(null, "dash")).toBe(true);
    expect(didPickUpLocalSkill("dash", "dash")).toBe(false);
    expect(didPickUpLocalSkill("dash", null)).toBe(false);
  });
});
```

- [ ] **Step 2: 写可归还对象池失败测试**

在 `tests/effect-pool.test.ts` 导入 `ReusableObjectPool` 并增加：

```ts
it("leases only its fixed capacity and reuses a released object", () => {
  const factory = vi.fn((index: number) => ({ index, visible: false }));
  const pool = new ReusableObjectPool(2, factory, (item) => { item.visible = false; });

  const first = pool.acquire((item) => { item.visible = true; });
  const second = pool.acquire();
  expect(pool.acquire()).toBeNull();
  expect(factory).toHaveBeenCalledTimes(2);

  expect(pool.release(first!)).toBe(true);
  expect(pool.acquire()).toBe(first);
  expect(pool.release(first!)).toBe(true);
  expect(pool.release(first!)).toBe(false);
  expect(second).not.toBeNull();
});

it("drops decorative sparks but keeps readable combat effects in reduced mode", () => {
  expect(shouldRenderEffect("spark", true)).toBe(false);
  expect(shouldRenderEffect("trail", true)).toBe(true);
  expect(shouldRenderEffect("impact", true)).toBe(true);
});
```

- [ ] **Step 3: 验证测试按预期失败**

Run: `npm.cmd test -- --run tests/combat-feedback.test.ts tests/effect-pool.test.ts`

Expected: FAIL，提示 `combat-feedback` 不存在，且 `ReusableObjectPool`、`spark`、`impact` 尚未定义。

- [ ] **Step 4: 实现纯反馈逻辑**

创建 `src/client/combat-feedback.ts`：

```ts
import type { SkillType } from "../shared/skill-catalog";
import type { Vec2 } from "../shared/protocol";

export interface TrailMemory extends Vec2 {
  emittedAt: number;
}

const TRAIL_DISTANCE = 14;

export function trailIntervalMs(lowPerformance: boolean): number {
  return lowPerformance ? 67 : 34;
}

export function projectileAngle(velocity: Vec2): number {
  return Math.atan2(velocity.y, velocity.x);
}

export function shouldEmitProjectileTrail(
  previous: TrailMemory,
  next: Vec2,
  now: number,
  lowPerformance: boolean,
): boolean {
  return now - previous.emittedAt >= trailIntervalMs(lowPerformance)
    && Math.hypot(next.x - previous.x, next.y - previous.y) >= TRAIL_DISTANCE;
}

export function didPickUpLocalSkill(
  previous: SkillType | null | undefined,
  next: SkillType | null,
): boolean {
  return previous === null && next !== null;
}
```

- [ ] **Step 5: 实现固定容量租借池和效果分类**

在 `src/client/effect-pool.ts` 中把类型扩展为：

```ts
export type CombatEffectKind =
  | "muzzle" | "trail" | "impact" | "spark"
  | "hit" | "shield" | "dash" | "heal" | "respawn";
```

增加：

```ts
export class ReusableObjectPool<T extends object> {
  readonly capacity: number;
  private readonly items: T[];
  private readonly indices = new Map<T, number>();
  private readonly leased = new Set<number>();
  private readonly free: number[];

  constructor(capacity: number, create: (index: number) => T, private readonly reset: (item: T) => void) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("Pool capacity must be a positive integer");
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, (_, index) => create(index));
    this.items.forEach((item, index) => this.indices.set(item, index));
    this.free = Array.from({ length: capacity }, (_, index) => capacity - index - 1);
  }

  acquire(configure?: (item: T) => void): T | null {
    const index = this.free.pop();
    if (index === undefined) return null;
    const item = this.items[index]!;
    this.leased.add(index);
    this.reset(item);
    configure?.(item);
    return item;
  }

  release(item: T): boolean {
    const index = this.indices.get(item);
    if (index === undefined || !this.leased.delete(index)) return false;
    this.reset(item);
    this.free.push(index);
    return true;
  }
}
```

把 `shouldRenderEffect` 改为：

```ts
export function shouldRenderEffect(effect: RenderEffectKind, lowPerformance: boolean): boolean {
  return !lowPerformance || (effect !== "environment" && effect !== "spark");
}
```

- [ ] **Step 6: 验证 Task 1 通过**

Run: `npm.cmd test -- --run tests/combat-feedback.test.ts tests/effect-pool.test.ts`

Expected: 2 个测试文件全部 PASS。

- [ ] **Step 7: 提交 Task 1**

```powershell
git add -- src/client/combat-feedback.ts src/client/effect-pool.ts tests/combat-feedback.test.ts tests/effect-pool.test.ts
git commit -m "feat: add bounded combat feedback primitives"
```

### Task 2: 强烈街机风子弹、持续拖尾与消散爆裂

**Files:**
- Modify: `src/client/game-scene.ts`
- Modify: `tests/combat-feedback.test.ts`

- [ ] **Step 1: 增加弹丸池容量失败测试**

在 `src/client/combat-feedback.ts` 预期导出 `PROJECTILE_VIEW_CAPACITY` 和 `effectCapacity`，并在 `tests/combat-feedback.test.ts` 增加：

```ts
it("preallocates enough projectile and trail views for six-player crossfire", () => {
  expect(PROJECTILE_VIEW_CAPACITY).toBe(256);
  expect(effectCapacity("trail")).toBe(160);
  expect(effectCapacity("impact")).toBe(36);
  expect(effectCapacity("spark")).toBe(96);
});
```

- [ ] **Step 2: 验证容量测试失败**

Run: `npm.cmd test -- --run tests/combat-feedback.test.ts`

Expected: FAIL，提示容量导出尚不存在。

- [ ] **Step 3: 实现容量常量**

在 `src/client/combat-feedback.ts` 增加：

```ts
import type { CombatEffectKind } from "./effect-pool";

export const PROJECTILE_VIEW_CAPACITY = 256;

const EFFECT_CAPACITIES: Readonly<Record<CombatEffectKind, number>> = {
  muzzle: 24, trail: 160, impact: 36, spark: 96,
  hit: 18, shield: 6, dash: 12, heal: 10, respawn: 8,
};

export function effectCapacity(kind: CombatEffectKind): number {
  return EFFECT_CAPACITIES[kind];
}
```

- [ ] **Step 4: 将弹丸视图改为三层预分配容器**

在 `src/client/game-scene.ts`：

```ts
interface MovingView {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  tail: Phaser.GameObjects.Rectangle;
  ownerId: string;
  color: number;
  lastTrail: TrailMemory;
}
```

增加 `ReusableObjectPool<MovingView>` 字段。在 `create()` 中创建容量为 `PROJECTILE_VIEW_CAPACITY` 的池；每个元素由尾部矩形、辉光圆和白色核心组成。重置函数必须停止该容器及子对象的 tween，并设置 `visible=false`、`active=false`、`alpha=1`、`scale=1`。

创建时使用以下核心样式：

```ts
const tail = this.add.rectangle(-42, 0, 86, 12, 0xffffff, 0.72).setOrigin(1, 0.5);
const glow = this.add.circle(0, 0, 19, 0xffffff, 0.42).setBlendMode(Phaser.BlendModes.ADD);
const core = this.add.circle(0, 0, 8, 0xffffff, 1).setStrokeStyle(3, 0xffffff, 0.95);
const container = this.add.container(0, 0, [tail, glow, core]).setDepth(6).setVisible(false).setActive(false);
```

- [ ] **Step 5: 替换弹丸生命周期同步**

在 `syncBufferedProjectiles` 中：

1. 弹丸消失时先在缓存位置调用 `playProjectileImpact(view)`，再从池中 `release(view)`。
2. 新弹丸从池中 `acquire`，写入 `ownerId`、角色颜色和初始 `lastTrail`；播放枪口闪光。
3. 每帧插值后设置容器位置与 `projectileAngle({ x: projectile.vx, y: projectile.vy })`。
4. 满足 `shouldEmitProjectileTrail` 时播放拖尾并更新 `lastTrail`。
5. 池暂时无空闲对象时跳过新装饰，但保留已有弹丸；记录一次节流后的 `console.warn`，不得循环创建池外对象。

子弹着色使用：

```ts
view.core.setFillStyle(0xffffff, 1).setStrokeStyle(3, color, 1);
view.glow.setFillStyle(color, this.lowPerformance ? 0.28 : 0.48);
view.tail.setFillStyle(color, this.lowPerformance ? 0.42 : 0.72);
```

- [ ] **Step 6: 增加爆裂环与受控火花**

将 `createEffectPools()` 改为使用 `effectCapacity(kind)`。为 `impact` 配置半径 15、描边 7、时长 230ms、缩放 4.2；为 `spark` 配置半径 4、时长 180ms、缩放 0.25。

新增 `playProjectileImpact(view)`：始终播放 `impact`；正常模式再从 `spark` 池借用最多 5 个小圆点并沿固定角度向外 tween，低性能模式通过 `shouldRenderEffect("spark", true)` 跳过火花。不得触发摄像机震动。

- [ ] **Step 7: 验证 Task 2**

Run: `npm.cmd test -- --run tests/combat-feedback.test.ts tests/effect-pool.test.ts`

Run: `npm.cmd run typecheck`

Expected: 测试全部 PASS，TypeScript exit 0。

- [ ] **Step 8: 提交 Task 2**

```powershell
git add -- src/client/combat-feedback.ts src/client/game-scene.ts tests/combat-feedback.test.ts
git commit -m "feat: render arcade projectile feedback"
```

### Task 3: 四类关键程序音效与防噪限流

**Files:**
- Create: `src/client/combat-audio.ts`
- Create: `tests/combat-audio.test.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/mobile-app.ts`

- [ ] **Step 1: 写音效策略失败测试**

创建 `tests/combat-audio.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { CombatAudioPolicy, readSoundMuted, writeSoundMuted } from "../src/client/combat-audio";

describe("v3.3 combat audio policy", () => {
  it("stays silent before unlock and while muted", () => {
    const policy = new CombatAudioPolicy();
    expect(policy.request({ kind: "hurt", local: true }, 100)).toBeNull();
    policy.unlock();
    policy.setMuted(true);
    expect(policy.request({ kind: "hurt", local: true }, 200)).toBeNull();
  });

  it("rate limits remote fire per source but prioritizes local feedback", () => {
    const policy = new CombatAudioPolicy();
    policy.unlock();
    expect(policy.request({ kind: "fire", local: false, sourceId: "enemy", distance: 400 }, 1_000)?.gain).toBeLessThan(1);
    expect(policy.request({ kind: "fire", local: false, sourceId: "enemy", distance: 400 }, 1_080)).toBeNull();
    expect(policy.request({ kind: "hurt", local: true }, 1_080)).toMatchObject({ kind: "hurt", gain: 1 });
  });

  it("persists only the mute preference", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    expect(readSoundMuted(storage)).toBe(false);
    writeSoundMuted(storage, true);
    expect(readSoundMuted(storage)).toBe(true);
  });
});
```

- [ ] **Step 2: 验证音效测试失败**

Run: `npm.cmd test -- --run tests/combat-audio.test.ts`

Expected: FAIL，提示 `combat-audio` 不存在。

- [ ] **Step 3: 实现音效策略与持久化**

创建 `src/client/combat-audio.ts`，定义：

```ts
export type CombatSoundKind = "fire" | "impact" | "hurt" | "pickup";
export interface CombatSoundRequest { kind: CombatSoundKind; local: boolean; sourceId?: string; distance?: number; }
export interface ApprovedCombatSound { kind: CombatSoundKind; gain: number; }
export interface SoundStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }

const SOUND_MUTED_KEY = "energy-brawl.sound-muted";
const REMOTE_FIRE_INTERVAL_MS = 140;

export class CombatAudioPolicy {
  private unlocked = false;
  private muted = false;
  private readonly remoteFireAt = new Map<string, number>();

  unlock(): void { this.unlocked = true; }
  setMuted(muted: boolean): void { this.muted = muted; }

  request(request: CombatSoundRequest, now: number): ApprovedCombatSound | null {
    if (!this.unlocked || this.muted) return null;
    if (request.kind === "fire" && !request.local) {
      const source = request.sourceId ?? "remote";
      const previous = this.remoteFireAt.get(source) ?? -Infinity;
      if (now - previous < REMOTE_FIRE_INTERVAL_MS) return null;
      this.remoteFireAt.set(source, now);
      const distance = Math.max(0, request.distance ?? 0);
      return { kind: "fire", gain: Math.max(0.12, 0.48 * (1 - Math.min(distance, 1_200) / 1_200)) };
    }
    return { kind: request.kind, gain: request.kind === "hurt" ? 1 : request.local ? 0.78 : 0.45 };
  }
}

export function readSoundMuted(storage: SoundStorage): boolean {
  try { return storage.getItem(SOUND_MUTED_KEY) === "1"; } catch { return false; }
}

export function writeSoundMuted(storage: SoundStorage, muted: boolean): void {
  try { storage.setItem(SOUND_MUTED_KEY, muted ? "1" : "0"); } catch { /* storage is optional */ }
}
```

- [ ] **Step 4: 实现 Web Audio 控制器**

同文件增加 `CombatAudio`：构造时读取静音状态；`unlock()` 在用户手势内创建或恢复 `AudioContext`；`playFire`、`playImpact`、`playHurt`、`playPickup` 先经过策略，再生成短促 oscillator/gain 包络。命中与受击所需的短噪声缓冲只在首次解锁时创建一次。所有 oscillator 在 `onended` 中断开节点；同时活跃的音效请求最多 8 个，`hurt` 不因远程枪声被拒绝。

程序音色固定为：

```ts
// fire: sine 760Hz -> 210Hz, 70ms
// impact: triangle 180Hz -> 70Hz + cached noise, 110ms
// hurt: square 150Hz -> 82Hz + cached noise, 130ms
// pickup: sine 520Hz then 780Hz, total 150ms
```

暴露 `isMuted`、`toggleMuted()`、`unlock()` 和四个播放方法。API 在 `AudioContext` 不可用或 `resume()` 被拒绝时必须静默返回。

- [ ] **Step 5: 接入场景关键事件**

让 `MobileApp` 创建单例 `CombatAudio(window.localStorage)`，并传给 `GameRenderer` 与 `ArenaScene`。

在场景中：

- 新弹丸：本地发射调用 `playFire({ local: true })`；远程发射传入发射者 ID 和到本地玩家的距离。
- 弹丸消失：仅当 `view.ownerId === localPlayerId` 时调用 `playImpact()`。
- `syncSnapshot` 检测本地玩家生命下降时调用 `playHurt()`。

在 `MobileApp.renderSkillButton()` 中使用 `didPickUpLocalSkill(previous, type)`，仅空槽变为有技能时调用 `playPickup()`。

- [ ] **Step 6: 验证 Task 3**

Run: `npm.cmd test -- --run tests/combat-audio.test.ts tests/combat-feedback.test.ts tests/mobile-skill.test.ts`

Run: `npm.cmd run typecheck`

Expected: 测试全部 PASS，TypeScript exit 0。

- [ ] **Step 7: 提交 Task 3**

```powershell
git add -- src/client/combat-audio.ts src/client/combat-feedback.ts src/client/game-scene.ts src/client/mobile-app.ts tests/combat-audio.test.ts
git commit -m "feat: add prioritized combat audio"
```

### Task 4: 手机横屏声音开关与音频解锁

**Files:**
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Create: `tests/mobile-audio-ui.test.ts`

- [ ] **Step 1: 写声音按钮失败测试**

创建 `tests/mobile-audio-ui.test.ts`：

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../src/client/mobile-app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

describe("mobile combat audio controls", () => {
  it("exposes the same sound toggle in the lobby header and battle HUD", () => {
    expect(app).toContain('<button class="sound-button" data-sound-toggle');
    expect(app).toContain('<button class="sound-button arena-sound" data-sound-toggle');
    expect(app).toContain('aria-label="关闭声音"');
  });

  it("keeps the sound button compact and outside the control sticks", () => {
    expect(styles).toContain(".sound-button");
    expect(styles).toContain(".arena-sound");
    expect(styles).toContain("pointer-events: auto");
  });
});
```

- [ ] **Step 2: 验证 UI 测试失败**

Run: `npm.cmd test -- --run tests/mobile-audio-ui.test.ts`

Expected: FAIL，因为模板尚无声音按钮。

- [ ] **Step 3: 增加声音按钮与统一状态**

在大厅 header actions 和 arena HUD 各增加：

```html
<button class="sound-button" data-sound-toggle type="button" aria-label="关闭声音">声音开</button>
```

对局按钮额外使用 `arena-sound` 类。在 `bindActions()` 中为两个按钮绑定：

```ts
for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-sound-toggle]")) {
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  button.addEventListener("click", async () => {
    await this.audio.unlock();
    this.audio.toggleMuted();
    this.syncSoundButtons();
  });
}
this.root.addEventListener("pointerdown", () => { void this.audio.unlock(); }, { once: true });
```

`syncSoundButtons()` 同时更新文字 `声音开/静音`、`aria-label` 和 `is-muted` 类，并在构造末尾及切换后调用。

- [ ] **Step 4: 增加横屏紧凑样式**

在 `src/client/styles.css` 增加 44px 最小触控尺寸、半透明深色背景、明显开启状态；`.arena-sound` 固定在全屏按钮左侧并启用 `pointer-events:auto`。在 `max-height:470px` 横屏媒体查询中将高度缩小到 34px，但保持足够的水平点击区域。不得覆盖左右虚拟摇杆或技能按钮。

- [ ] **Step 5: 验证 Task 4**

Run: `npm.cmd test -- --run tests/mobile-audio-ui.test.ts tests/mobile-layout.test.ts tests/mobile-viewport.test.ts tests/touch-router.test.ts`

Run: `npm.cmd run typecheck`

Expected: 测试全部 PASS，TypeScript exit 0。

- [ ] **Step 6: 提交 Task 4**

```powershell
git add -- src/client/mobile-app.ts src/client/styles.css tests/mobile-audio-ui.test.ts
git commit -m "feat: add mobile sound controls"
```

### Task 5: v3.3 发布、完整回归与六人验收

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] **Step 1: 更新版本与说明**

把 `package.json`、`package-lock.json` 的版本更新为 `3.3.0`。README 新增 v3.3 小节，明确记录强烈街机风子弹、持续拖尾、命中爆裂、四类关键音效、静音开关和低性能降级，并明确没有加入大招或改变战斗数值。

- [ ] **Step 2: 运行完整自动验证**

Run: `npm.cmd test -- --run`

Expected: 所有测试文件和测试项 PASS。

Run: `npm.cmd run typecheck`

Expected: exit 0。

Run: `npm.cmd run build`

Expected: Vite 生产构建 exit 0。

Run: `git diff --check`

Expected: exit 0，无空白错误。

- [ ] **Step 3: 运行六客户端压力测试**

Run: `npm.cmd run load-test:v3 -- --seconds=60 --clients=6`

Expected: 六客户端完成；`minimumSnapshots > 0`、`skillActions > 0`、`wallViolations = 0`，无未捕获异常。

- [ ] **Step 4: 浏览器视觉与音频验收**

在 `844×390` 横屏中完成：加入、准备、开局、持续射击、受击、拾取技能球、静音、解除静音和刷新恢复。确认：

- 子弹方向正确，大光核、长拖尾与命中爆裂清晰。
- 六人射击时战场仍可读，摇杆和技能按钮不被特效或声音按钮遮挡。
- 首次手势后音频可播放；本地发射、命中、受击和拾取声音可区分。
- 远程枪声受到限流，连续射击不会造成刺耳叠音。
- 静音即时生效并在刷新后保持。
- reduced 模式关闭次要火花但保留子弹核心、拖尾和命中环。
- 房主页和玩家页非空，console 无相关 error/warn。

- [ ] **Step 5: 精确提交发布文件**

只暂存 v3.3 文件，继续排除现有局域网修复：`src/server/index.ts`、`src/server/lan-address.ts`、`src/server/port.ts`、`tests/lan-address.test.ts`、`tests/server-port.test.ts`。

```powershell
git add -- README.md package.json package-lock.json
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: release energy brawl v3.3"
```

Expected: 发布提交只包含三个版本文件；最后 `git status --short` 仅剩上述五个局域网文件。
