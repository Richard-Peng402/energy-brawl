# Energy Brawl Exclusive Skill VFX And Audio Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all six existing characters complete telegraph, cast, active, and end feedback, then add character-specific projectile presentation and map ambience without lowering render quality or changing combat balance.

**Architecture:** The server publishes bounded, sequence-numbered semantic skill and projectile-impact events while authoritative player snapshots continue to reconstruct persistent effects after reconnect. Focused client modules select immutable VFX/audio profiles; Phaser owns pooled instances and Web Audio owns priority-aware buses, sampled layers, and procedural fallbacks.

**Tech Stack:** TypeScript, Phaser 3, Socket.IO snapshots, Web Audio API, Vibration API, Vitest, Vite, PNG sprite sheets, WAV/OGG-compatible decoded audio buffers.

---

## File Structure

**Create:**

- `src/shared/exclusive-skill-targeting.ts` - shared map-aware destination and telegraph geometry resolution.
- `src/server/presentation-events.ts` - bounded authoritative event recording and expiry.
- `src/client/exclusive-skill-feedback.ts` - event dedupe, relationship classification, reconnect-safe selection.
- `src/client/exclusive-skill-vfx.ts` - six immutable four-stage visual profiles.
- `src/client/exclusive-skill-audio.ts` - six immutable skill audio identities and sample URLs.
- `src/client/projectile-presentation.ts` - six projectile presentation profiles and impact selection.
- `src/client/environment-audio.ts` - map ambience lifecycle, ducking, and local preferences.
- `tests/presentation-events.test.ts`
- `tests/exclusive-skill-targeting.test.ts`
- `tests/exclusive-skill-feedback.test.ts`
- `tests/exclusive-skill-vfx.test.ts`
- `tests/exclusive-skill-audio.test.ts`
- `tests/vfx-audio-assets.test.ts`
- `tests/projectile-presentation.test.ts`
- `tests/environment-audio.test.ts`
- `scripts/validate-vfx-audio-assets.mjs`

**Modify:**

- `src/shared/protocol.ts` - event contracts and snapshot arrays.
- `src/server/exclusive-skill-system.ts` - return lifecycle transitions instead of silently clearing state.
- `src/server/simulation.ts` - record skill and projectile-impact events.
- `src/client/asset-registry.ts` - skill stage, projectile, and ambience asset URLs.
- `src/client/combat-audio.ts` - shared buses, priority, panning, sample cache, and limiter.
- `src/client/combat-haptics.ts` - skill-stage haptic profiles.
- `src/client/game-scene.ts` - pooled VFX orchestration only.
- `src/client/mobile-app.ts` - feedback routing and effects/ambience controls.
- `src/client/styles.css` - compact audio settings and fallback feedback.
- `public/assets/v4/manifest.json`
- `THIRD_PARTY_ASSETS.md`
- `package.json`
- focused existing tests under `tests/`.

---

### Task 0: Close And Isolate The Existing v4.5.0 Baseline

**Files:**
- Verify: current worktree status and `artifacts/qa/map-feedback-soak/`
- Create at execution time: a D-drive worktree for the new feature branch

- [ ] **Step 1: Record the current baseline without touching files**

Run:

```powershell
git status --short
git branch --show-current
git log -3 --oneline
```

Expected: the existing v4.5.0 map-feedback work remains visible and is not silently mixed into the new feature.

- [ ] **Step 2: Complete the outstanding physical gate**

Run the existing server, join with one real phone and one desktop browser, fill remaining seats with bots, and complete the previously approved 30-minute six-player soak. Preserve desktop, phone, in-match, and result screenshots under `artifacts/qa/map-feedback-soak/`.

Expected: no disconnect loop, stuck input, wall penetration, friendly fire, missing map warning, blank diagnostic report, or sustained visible hitching.

- [ ] **Step 3: Re-run the baseline release gates**

Run:

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run assets:v3
npm.cmd run assets:v4
npm.cmd run smoke:clean-clone
npm.cmd run doctor
git diff --check
```

Expected: zero failures, valid LAN URL, `Any / TCP 3000-3010 / LocalSubnet`, and a complete clean-clone asset set.

- [ ] **Step 4: Commit the existing baseline separately**

Stage only the existing v4.5.0 implementation, its tests, README/version changes approved for that baseline, and the two 2026-08-15 design/plan documents. Do not include any new VFX/audio implementation.

```powershell
git add src tests docs/superpowers/specs/2026-08-15-energy-brawl-match-continuity-feedback-design.md docs/superpowers/plans/2026-08-15-energy-brawl-match-continuity-feedback.md README.md package.json package-lock.json
git commit -m "feat: complete map feedback and match continuity"
```

Expected: a clean tracked baseline except ignored QA artifacts.

- [ ] **Step 5: Create the isolated feature worktree on D:**

Invoke `superpowers:using-git-worktrees`, then create a new branch and worktree rooted on the completed baseline, for example:

```powershell
git worktree add D:\CodexWorktrees\多人对战小游戏\energy-brawl-exclusive-vfx-audio -b codex/exclusive-vfx-audio
```

Expected: all following tasks run only in the new D-drive worktree.

---

### Task 1: Define Bounded Presentation Event Contracts

**Files:**
- Modify: `src/shared/protocol.ts`
- Create: `src/server/presentation-events.ts`
- Create: `tests/presentation-events.test.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: Write failing contract and bounded-history tests**

```typescript
import { describe, expect, it } from "vitest";
import { appendPresentationEvent } from "../src/server/presentation-events";
import type { ExclusiveSkillEvent, ProjectileImpactEvent } from "../src/shared/protocol";

describe("bounded presentation events", () => {
  it("keeps only the newest event window with monotonic sequences", () => {
    const events: ExclusiveSkillEvent[] = [];
    for (let sequence = 1; sequence <= 40; sequence += 1) {
      appendPresentationEvent(events, {
        eventSeq: sequence,
        serverTime: sequence,
        playerId: "p1",
        skillId: "breach",
        stage: "cast",
        origin: { x: 10, y: 20 },
        target: { x: 30, y: 20 },
      }, 24);
    }
    expect(events).toHaveLength(24);
    expect(events[0]!.eventSeq).toBe(17);
    expect(events.at(-1)!.eventSeq).toBe(40);
  });

  it("accepts wall, player, and shield projectile impacts", () => {
    const events: ProjectileImpactEvent[] = [];
    for (const [index, kind] of ["wall", "player", "shield"].entries()) {
      appendPresentationEvent(events, {
        eventSeq: index + 1,
        serverTime: 100 + index,
        projectileId: `b${index}`,
        ownerId: "p1",
        targetId: kind === "wall" ? null : "p2",
        kind: kind as ProjectileImpactEvent["kind"],
        position: { x: 100, y: 200 },
      }, 32);
    }
    expect(events.map((event) => event.kind)).toEqual(["wall", "player", "shield"]);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/presentation-events.test.ts tests/simulation.test.ts
```

Expected: FAIL because the new event types, snapshot arrays, and append helper do not exist.

- [ ] **Step 3: Add the shared contracts**

Replace the unused legacy `ExclusiveSkillEventStage = "telegraph" | "cast" | "impact" | "end"` socket-event contract in `src/shared/protocol.ts`. Telegraph remains local-only, projectile impacts use their own event type, and accepted skill lifecycle edges use:

```typescript
export type ExclusiveSkillEventStage = "cast" | "active" | "end";

export interface ExclusiveSkillEvent {
  eventSeq: number;
  serverTime: number;
  playerId: string;
  skillId: ExclusiveSkillId;
  stage: ExclusiveSkillEventStage;
  origin: Vec2;
  target: Vec2;
  reason?: "expired" | "death" | "reset" | "return";
}

export interface ProjectileImpactEvent {
  eventSeq: number;
  serverTime: number;
  projectileId: string;
  ownerId: string;
  targetId: string | null;
  kind: "wall" | "player" | "shield";
  position: Vec2;
}
```

Extend `GameSnapshot` with:

```typescript
exclusiveSkillEvents?: readonly ExclusiveSkillEvent[];
projectileImpactEvents?: readonly ProjectileImpactEvent[];
```

Remove the unused `skillEvent` member from `ServerToClientEvents`; there must be one authoritative delivery path, the bounded snapshot arrays, so reconnect and volatile snapshot behavior cannot double-play the same stage.

- [ ] **Step 4: Add the bounded append helper**

Create `src/server/presentation-events.ts`:

```typescript
export function appendPresentationEvent<T>(events: T[], event: T, capacity: number): void {
  events.push(event);
  const overflow = events.length - capacity;
  if (overflow > 0) events.splice(0, overflow);
}
```

- [ ] **Step 5: Initialize and serialize event history**

Extend `GameWorld` with:

```typescript
nextExclusiveSkillEventSeq: number;
exclusiveSkillEvents: ExclusiveSkillEvent[];
nextProjectileImpactEventSeq: number;
projectileImpactEvents: ProjectileImpactEvent[];
```

Initialize sequences to `1`, histories to `[]`, and expose both arrays from `worldToSnapshot` as copied arrays.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- --run tests/presentation-events.test.ts tests/simulation.test.ts
git add src/shared/protocol.ts src/server/presentation-events.ts src/server/simulation.ts tests/presentation-events.test.ts tests/simulation.test.ts
git commit -m "feat: add bounded combat presentation events"
```

Expected: focused tests PASS.

---

### Task 2: Emit Authoritative Exclusive Skill Lifecycle Events

**Files:**
- Modify: `src/server/exclusive-skill-system.ts`
- Modify: `src/server/simulation.ts`
- Modify: `tests/exclusive-skill-system.test.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Add tests proving:

```typescript
it("publishes cast and active events for an accepted exclusive skill", () => {
  const world = createWorld();
  expect(applyWorldExclusiveSkill(world, "red", { x: 1, y: 0 })).toBe(true);
  expect(world.exclusiveSkillEvents.map((event) => event.stage)).toEqual(["cast", "active"]);
  expect(world.exclusiveSkillEvents.every((event) => event.skillId === "breach")).toBe(true);
});

it("publishes one end event when a timed state expires", () => {
  const world = createWorld();
  applyWorldExclusiveSkill(world, "red", { x: 1, y: 0 });
  world.now = 5_001;
  stepWorld(world, 1);
  expect(world.exclusiveSkillEvents.filter((event) => event.stage === "end")).toHaveLength(1);
});

it("publishes death cleanup without replaying cast", () => {
  const world = createWorld();
  applyWorldExclusiveSkill(world, "red", { x: 1, y: 0 });
  damagePlayer(world, "red", "blue", 10_000);
  expect(world.exclusiveSkillEvents.at(-1)).toMatchObject({ playerId: "red", stage: "end", reason: "death" });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd test -- --run tests/exclusive-skill-system.test.ts tests/simulation.test.ts
```

Expected: FAIL because lifecycle transitions are silently cleared.

- [ ] **Step 3: Return cleared states from the exclusive system**

Change the lifecycle helpers to preserve the previous state:

```typescript
export function clearExclusiveSkillState(player: ExclusiveSkillPlayer): ExclusiveRuntimeState | null {
  const previous = player.exclusiveSkillState ?? null;
  player.exclusiveSkillState = null;
  return previous;
}

export function advanceExclusiveSkillEffects(
  players: readonly ExclusiveSkillPlayer[],
  now: number,
): Array<{ playerId: string; state: ExclusiveRuntimeState }> {
  const ended: Array<{ playerId: string; state: ExclusiveRuntimeState }> = [];
  for (const player of players) {
    const state = player.exclusiveSkillState;
    if (!state || now < state.expiresAt) continue;
    ended.push({ playerId: player.id, state });
    player.exclusiveSkillState = null;
  }
  return ended;
}
```

- [ ] **Step 4: Record cast, active, and end events in simulation**

Add a focused helper in `simulation.ts`:

```typescript
function recordExclusiveSkillEvent(
  world: GameWorld,
  input: Omit<ExclusiveSkillEvent, "eventSeq" | "serverTime">,
): void {
  appendPresentationEvent(world.exclusiveSkillEvents, {
    ...input,
    eventSeq: world.nextExclusiveSkillEventSeq++,
    serverTime: world.now,
  }, 24);
}
```

On accepted use, record `cast`, then `active`. Consume the ended-state array returned by `advanceExclusiveSkillEffects`. Change the existing `advanceExclusiveMovement` completion path to return the state it is about to clear when `returning === true`, then record exactly one `end` event with `reason: "return"`. Death and forced reset first capture the previous state from `clearExclusiveSkillState`, then emit one `end`; a null previous state emits nothing.

- [ ] **Step 5: Keep rejected requests silent**

Add an assertion that a dead player or cooldown rejection leaves `world.exclusiveSkillEvents` unchanged.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- --run tests/exclusive-skill-system.test.ts tests/simulation.test.ts
git add src/server/exclusive-skill-system.ts src/server/simulation.ts tests/exclusive-skill-system.test.ts tests/simulation.test.ts
git commit -m "feat: publish exclusive skill lifecycle events"
```

Expected: lifecycle tests PASS and existing balance values remain unchanged.

---

### Task 3: Select And Deduplicate Client Skill Feedback

**Files:**
- Create: `src/client/exclusive-skill-feedback.ts`
- Create: `tests/exclusive-skill-feedback.test.ts`
- Modify: `src/client/game-scene.ts`

- [ ] **Step 1: Write failing selector tests**

```typescript
import { describe, expect, it } from "vitest";
import { selectExclusiveSkillFeedback } from "../src/client/exclusive-skill-feedback";

it("returns only events newer than the last consumed sequence", () => {
  const events = [
    { eventSeq: 4, serverTime: 10, playerId: "a", skillId: "breach", stage: "cast", origin: { x: 0, y: 0 }, target: { x: 1, y: 0 } },
    { eventSeq: 5, serverTime: 11, playerId: "a", skillId: "breach", stage: "active", origin: { x: 0, y: 0 }, target: { x: 1, y: 0 } },
  ] as const;
  expect(selectExclusiveSkillFeedback(events, 4).events.map((event) => event.eventSeq)).toEqual([5]);
});

it("baselines the first snapshot without replaying historical casts", () => {
  const result = selectExclusiveSkillFeedback([
    { eventSeq: 19, serverTime: 10, playerId: "a", skillId: "breach", stage: "cast", origin: { x: 0, y: 0 }, target: { x: 1, y: 0 } },
    { eventSeq: 20, serverTime: 11, playerId: "a", skillId: "breach", stage: "active", origin: { x: 0, y: 0 }, target: { x: 1, y: 0 } },
  ], null);
  expect(result.events).toEqual([]);
  expect(result.lastSequence).toBe(20);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/exclusive-skill-feedback.test.ts
```

Expected: FAIL because the selector does not exist.

- [ ] **Step 3: Implement the pure selector**

```typescript
import type { ExclusiveSkillEvent } from "../shared/protocol";

export interface SelectedExclusiveSkillFeedback {
  events: ExclusiveSkillEvent[];
  lastSequence: number;
}

export function selectExclusiveSkillFeedback(
  events: readonly ExclusiveSkillEvent[],
  lastSequence: number | null,
): SelectedExclusiveSkillFeedback {
  if (lastSequence === null) {
    return { events: [], lastSequence: events.at(-1)?.eventSeq ?? 0 };
  }
  const selected = events.filter((event) => event.eventSeq > lastSequence);
  return {
    events: selected.map((event) => ({ ...event })),
    lastSequence: selected.at(-1)?.eventSeq ?? lastSequence,
  };
}
```

Keep local/ally/enemy classification in a second pure helper that accepts player/team data and source position. Add a reconnect test where an active snapshot reconstructs the persistent view but produces no historical `cast` sound.

- [ ] **Step 4: Consume once per snapshot**

Add nullable `lastExclusiveSkillEventSeq` to `ArenaScene` and process events before persistent state synchronization. Do not reset it on a transport reconnect. A new match creates a new renderer after the existing lobby transition destroys the prior scene, so the new scene baselines its first snapshot exactly once.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd test -- --run tests/exclusive-skill-feedback.test.ts tests/network-snapshot-provider.test.ts
git add src/client/exclusive-skill-feedback.ts src/client/game-scene.ts tests/exclusive-skill-feedback.test.ts
git commit -m "feat: select reconnect-safe skill feedback"
```

---

### Task 4: Define Six Complete Four-Stage VFX Profiles

**Files:**
- Create: `src/client/exclusive-skill-vfx.ts`
- Create: `tests/exclusive-skill-vfx.test.ts`
- Modify: `src/client/asset-registry.ts`

- [ ] **Step 1: Write failing profile completeness tests**

```typescript
import { describe, expect, it } from "vitest";
import { EXCLUSIVE_SKILL_IDS } from "../src/shared/exclusive-skill-catalog";
import { getExclusiveSkillVfxProfile } from "../src/client/exclusive-skill-vfx";

it("defines telegraph, cast, active, and end for all six skills", () => {
  for (const skillId of EXCLUSIVE_SKILL_IDS) {
    const profile = getExclusiveSkillVfxProfile(skillId);
    expect(Object.keys(profile.stages).sort()).toEqual(["active", "cast", "end", "telegraph"]);
    expect(profile.poolCapacity).toBeGreaterThanOrEqual(2);
    expect(profile.poolCapacity).toBeLessThanOrEqual(24);
  }
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/exclusive-skill-vfx.test.ts
```

- [ ] **Step 3: Export a stable skill ID list**

Add to `exclusive-skill-catalog.ts`:

```typescript
export const EXCLUSIVE_SKILL_IDS = EXCLUSIVE_SKILL_CATALOG.map((skill) => skill.id) as readonly ExclusiveSkillId[];
```

- [ ] **Step 4: Implement immutable profiles**

Use this interface:

```typescript
export interface ExclusiveStageVfxProfile {
  durationMs: number;
  textureKey: string;
  blendMode: "add" | "screen" | "normal";
  scale: number;
  alpha: number;
  color: number;
  shape: "path" | "ring" | "arc" | "corridor" | "afterimage" | "field";
}

export interface ExclusiveSkillVfxProfile {
  skillId: ExclusiveSkillId;
  poolCapacity: number;
  stages: Record<"telegraph" | "cast" | "active" | "end", ExclusiveStageVfxProfile>;
}
```

Define all six profiles explicitly; do not derive them from player color alone. `getExclusiveSkillVfxProfile` returns a defensive copy.

- [ ] **Step 5: Register logical stage assets with an existing fallback**

Add `EXCLUSIVE_SKILL_STAGE_ASSETS` keyed by skill ID and `cast | active | end`. Until Task 10 installs the final sprite sheets, every stage points to the character's existing `/assets/v4/fx/skills/<character>.svg` so this task remains runnable from a clean clone. Telegraph geometry remains procedural because it must match exact range and collision rules.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- --run tests/exclusive-skill-vfx.test.ts tests/asset-registry.test.ts
git add src/shared/exclusive-skill-catalog.ts src/client/exclusive-skill-vfx.ts src/client/asset-registry.ts tests/exclusive-skill-vfx.test.ts tests/asset-registry.test.ts
git commit -m "feat: define six four-stage skill vfx profiles"
```

---

### Task 5: Build Pooled Skill Effect Instances And Exact Telegraphs

**Files:**
- Create: `src/shared/exclusive-skill-targeting.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `src/client/skill-indicator.ts`
- Modify: `src/client/skill-effects.ts`
- Modify: `tests/skill-indicator.test.ts`
- Modify: `tests/skill-effects.test.ts`
- Create: `tests/exclusive-skill-targeting.test.ts`
- Modify: `src/server/exclusive-skill-system.ts`
- Modify: `src/server/simulation.ts`

- [ ] **Step 1: Add failing stage and cleanup tests**

Assert that:

- Blaze and Phase telegraphs expose path, endpoint, and valid/invalid destination.
- Medic exposes an exact radius.
- Fortress exposes frontal and ally-protection arcs.
- Arc and Runner expose self-centered activation bounds.
- every one-shot stage duration is bounded below 900 ms;
- all persistent effects have an explicit release path.
- displacement destination validity matches the authoritative wall set on all three maps.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd test -- --run tests/skill-indicator.test.ts tests/skill-effects.test.ts tests/exclusive-skill-targeting.test.ts
```

- [ ] **Step 3: Replace character branches with a pooled stage renderer**

Add a renderer entry point shaped as:

```typescript
private playExclusiveSkillEvent(event: ExclusiveSkillEvent): void {
  const profile = getExclusiveSkillVfxProfile(event.skillId).stages[event.stage];
  const instance = this.exclusiveStagePools[event.skillId][event.stage].acquire((view) => {
    configureExclusiveStageView(view, event, profile);
  });
  if (!instance) return;
  this.time.delayedCall(profile.durationMs, () => this.exclusiveStagePools[event.skillId][event.stage].release(instance));
}
```

Persistent active views remain keyed by player ID and are reconstructed from `exclusiveSkillState`.

- [ ] **Step 4: Implement exact local telegraphs**

Create `resolveExclusiveSkillTargeting(input)` in `src/shared/exclusive-skill-targeting.ts`. It accepts `skillId`, origin, direction, range, arena bounds, player radius, and the active map wall list, then returns the clamped endpoint, path, and validity. Both `applyExclusiveSkill` and the local indicator call this shared pure function so Phase and Blaze cannot disagree on Neon Docks or Crystal Ruins.

Extend the existing indicator snapshot without replacing its current `SkillIndicatorShape` catalog:

```typescript
geometryKind: "path" | "circle" | "frontal-arc" | "self";
valid: boolean;
endpoint: Vec2;
secondaryRadius?: number;
```

The mobile and mouse input paths continue to use the dedicated skill joystick/held-key flow.

- [ ] **Step 5: Verify cleanup**

On scene shutdown, death, reset, map change, and match identity change, clear one-shot pools, persistent views, tweens, and sequence state.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- --run tests/skill-indicator.test.ts tests/skill-effects.test.ts tests/exclusive-skill-feedback.test.ts tests/exclusive-skill-targeting.test.ts tests/exclusive-skill-system.test.ts tests/simulation.test.ts
git add src/shared/exclusive-skill-targeting.ts src/server/exclusive-skill-system.ts src/server/simulation.ts src/client/game-scene.ts src/client/skill-indicator.ts src/client/skill-effects.ts tests/exclusive-skill-targeting.test.ts tests/skill-indicator.test.ts tests/skill-effects.test.ts tests/exclusive-skill-system.test.ts tests/simulation.test.ts
git commit -m "feat: render pooled four-stage skill feedback"
```

---

### Task 6: Finish Blaze And Phase Displacement Presentation

**Files:**
- Modify: `src/client/exclusive-skill-vfx.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/exclusive-skill-vfx.test.ts`
- Modify: `tests/camera-follow.test.ts`

- [ ] **Step 1: Write failing displacement assertions**

Assert Blaze has anchor create, travel, return, and expiry variants; Phase has origin tear, corridor, destination assembly, and closure variants. Verify return uses the authoritative anchor and Phase never renders an unsafe destination as valid.

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/exclusive-skill-vfx.test.ts tests/camera-follow.test.ts
```

- [ ] **Step 3: Implement Blaze presentation**

Use server origin/target for the cast path, `exclusiveSkillState.anchor` for the persistent beacon, and `reason: "return"` for the reverse-collapse end variant. Anchor expiry uses a quiet dissolve.

- [ ] **Step 4: Implement Phase presentation**

Use server origin/target for the corridor and destination. Preserve the existing camera-follow behavior; the effect travels independently and never changes authoritative position.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd test -- --run tests/exclusive-skill-vfx.test.ts tests/camera-follow.test.ts tests/simulation.test.ts
git add src/client/exclusive-skill-vfx.ts src/client/game-scene.ts tests/exclusive-skill-vfx.test.ts tests/camera-follow.test.ts
git commit -m "feat: finish displacement skill presentation"
```

---

### Task 7: Finish Medic And Fortress Area Presentation

**Files:**
- Modify: `src/client/exclusive-skill-vfx.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `src/server/simulation.ts`
- Modify: `tests/exclusive-skill-vfx.test.ts`
- Modify: `tests/simulation.test.ts`

- [ ] **Step 1: Write failing area-feedback assertions**

Verify Medic active feedback distinguishes actual healing from cleansing, and Fortress distinguishes self-facing protection, ally protection, enemy suppression, shield contact, and normal end.

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/exclusive-skill-vfx.test.ts tests/simulation.test.ts
```

- [ ] **Step 3: Add compact result metadata**

Extend the skill event with optional presentation metadata that is computed authoritatively:

```typescript
metadata?: {
  healedTargetIds?: readonly string[];
  cleansedTargetIds?: readonly string[];
  affectedTargetIds?: readonly string[];
};
```

Only include IDs needed to place effects; do not send health history or additional private data.

- [ ] **Step 4: Render Medic target flows and cleanse sparkles**

The central pulse always plays after an accepted cast. Target flows play only for IDs in `healedTargetIds`; cleanse sparkles play only for `cleansedTargetIds`.

- [ ] **Step 5: Render Fortress directional layers**

The barrier follows the authoritative facing direction. Ally shimmer and enemy suppression use separate edge treatments. Projectile shield contacts reuse the later impact-event contract.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- --run tests/exclusive-skill-vfx.test.ts tests/simulation.test.ts tests/status-effects.test.ts
git add src/shared/protocol.ts src/server/simulation.ts src/client/exclusive-skill-vfx.ts src/client/game-scene.ts tests/exclusive-skill-vfx.test.ts tests/simulation.test.ts
git commit -m "feat: finish medic and fortress presentation"
```

---

### Task 8: Finish Arc And Runner Timed Buff Presentation

**Files:**
- Modify: `src/client/exclusive-skill-vfx.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/exclusive-skill-vfx.test.ts`
- Modify: `tests/render-metrics.test.ts`

- [ ] **Step 1: Write failing timed-buff assertions**

Verify Arc has weapon charge, active current, enhanced muzzle marker, and safe discharge. Verify Runner has acceleration burst, at least three pooled afterimages, enhanced projectile exhaust marker, and merge-style end.

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/exclusive-skill-vfx.test.ts tests/render-metrics.test.ts
```

- [ ] **Step 3: Implement Arc timed visuals**

Bind current intensity to authoritative active time, not local frame count. Weapon glow and muzzle accents use existing weapon rotation and remain above the character sprite.

- [ ] **Step 4: Implement Runner afterimages**

Use a fixed pool of directional character sprites sampled from interpolated positions. End feedback moves residual images toward the current player position before release.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd test -- --run tests/exclusive-skill-vfx.test.ts tests/render-metrics.test.ts tests/weapon-layer.test.ts
git add src/client/exclusive-skill-vfx.ts src/client/game-scene.ts tests/exclusive-skill-vfx.test.ts tests/render-metrics.test.ts tests/weapon-layer.test.ts
git commit -m "feat: finish arc and runner presentation"
```

---

### Task 9: Add Character Skill Audio Identities And Haptics

**Files:**
- Create: `src/client/exclusive-skill-audio.ts`
- Create: `tests/exclusive-skill-audio.test.ts`
- Modify: `src/client/combat-audio.ts`
- Modify: `src/client/combat-haptics.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `tests/combat-audio.test.ts`
- Modify: `tests/combat-haptics.test.ts`

- [ ] **Step 1: Write failing identity and priority tests**

```typescript
it("defines distinct cast, active, and end cues for all six skills", () => {
  const serialized = EXCLUSIVE_SKILL_IDS.flatMap((id) =>
    (["cast", "active", "end"] as const).map((stage) => JSON.stringify(getExclusiveSkillAudioProfile(id, stage))),
  );
  expect(new Set(serialized).size).toBe(serialized.length);
});

it("prioritizes local skill over remote fire but below local kill", () => {
  expect(soundPriority({ kind: "kill", local: true })).toBeGreaterThan(soundPriority({ kind: "exclusive-skill", local: true }));
  expect(soundPriority({ kind: "exclusive-skill", local: true })).toBeGreaterThan(soundPriority({ kind: "fire", local: false }));
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/exclusive-skill-audio.test.ts tests/combat-audio.test.ts tests/combat-haptics.test.ts
```

- [ ] **Step 3: Define audio identities**

Use this profile shape:

```typescript
export interface ExclusiveSkillAudioProfile {
  skillId: ExclusiveSkillId;
  stage: "cast" | "active" | "end";
  sampleUrl: string;
  fallbackTones: readonly SynthTone[];
  gain: number;
  maxDistance: number;
  priority: number;
  loop: boolean;
  maxDurationMs: number;
}
```

All six skills receive distinct frequency envelopes and sample paths. End cues remain lower priority than cast cues. Only explicitly marked restrained `active` bodies may loop; they are keyed by player and skill, capped by the authoritative expiry time, and stopped by `end`, death, reset, scene shutdown, or AudioContext suspension.

- [ ] **Step 4: Add mixer priority and panning**

Extend `CombatSoundRequest` with source position or normalized pan. Clamp pan to `[-0.75, 0.75]`, distance gain to `[0, 1]`, and active voices per category. Use `StereoPannerNode` when available and a centered gain fallback otherwise.

- [ ] **Step 5: Preserve iPhone unlock and sample fallback**

Preload skill buffers only after successful user-gesture unlock. If fetch or decode fails, immediately use the procedural cue. Resume suspended contexts on later gestures without replaying old events.

- [ ] **Step 6: Add skill haptic profiles**

Local cast uses a short pulse, sustained activation uses at most one confirmation pattern, and end uses a lighter pulse. Unsupported vibration uses the existing CSS fallback.

- [ ] **Step 7: Run tests and commit**

```powershell
npm.cmd test -- --run tests/exclusive-skill-audio.test.ts tests/combat-audio.test.ts tests/combat-haptics.test.ts tests/mobile-audio-ui.test.ts
git add src/client/exclusive-skill-audio.ts src/client/combat-audio.ts src/client/combat-haptics.ts src/client/mobile-app.ts tests/exclusive-skill-audio.test.ts tests/combat-audio.test.ts tests/combat-haptics.test.ts tests/mobile-audio-ui.test.ts
git commit -m "feat: add six exclusive skill audio identities"
```

---

### Task 10: Acquire, Normalize, And Validate The Complete Presentation Asset Pack

**Files:**
- Create/Modify: `public/assets/v4/fx/exclusive-skills/**`
- Create/Modify: `public/assets/v4/audio/exclusive-skills/**`
- Create/Modify: `public/assets/v4/fx/projectiles/**`
- Create/Modify: `public/assets/v4/audio/projectiles/**`
- Create/Modify: `public/assets/v4/audio/maps/**`
- Create: `scripts/validate-vfx-audio-assets.mjs`
- Modify: `public/assets/v4/manifest.json`
- Modify: `THIRD_PARTY_ASSETS.md`
- Modify: `package.json`
- Create: `tests/vfx-audio-assets.test.ts`
- Modify: `tests/runtime-assets.test.ts`

- [ ] **Step 1: Write failing asset validation tests**

Require each of the six skills to have `cast`, `active`, and `end` visual and audio outputs; each character to have muzzle, core, trail, wall impact, player impact, and shield impact visual outputs plus a restrained local-fire/impact audio identity; and each of the three maps to have a seamless ambience file. Every entry requires non-empty author, license, source URL, modification notes, and local output files.

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/vfx-audio-assets.test.ts
```

- [ ] **Step 3: Select redistributable source assets**

Prefer CC0 or CC-BY assets that match the existing science-fiction pixel style. Reuse the already approved Kenney Particle Pack for generic sparks, rings, and smoke where it fits. Any additional source must have a stable public URL and explicit redistribution terms before download.

Reject assets marked personal-use-only, no-derivatives when recoloring/cropping is required, or assets with no identifiable license.

- [ ] **Step 4: Normalize assets**

Produce transparent PNG sheets with stable anchors and declared frame metadata. Store short skill/projectile cues as 48 kHz WAV; store longer seamless ambience in a Safari-compatible format with a decoded-buffer fallback verified on iPhone. Normalize peaks below clipping, remove leading silence from input-critical cues, and record loop points for ambience.

- [ ] **Step 5: Add the validation script**

The script must verify:

```javascript
const requiredSkills = ["breach", "pulse-heal", "mobile-bulwark", "capacitor-overload", "phase-shift", "afterimage-run"];
const requiredStages = ["cast", "active", "end"];
const requiredProjectileParts = ["muzzle", "core", "trail", "impact-wall", "impact-player", "impact-shield"];
const requiredMaps = ["reactor-core", "neon-docks", "crystal-ruins"];
```

For every skill-stage pair, require one visual file and one audio file. For every character projectile part, require the declared visual file; require the character's local-fire and impact cue entries. For every map, require one decodable ambience file and loop metadata. Validate manifest metadata, readable dimensions/duration, non-zero byte length, and exact path casing so clean clones behave the same on case-sensitive systems.

- [ ] **Step 6: Register the command and run validation**

Add:

```json
"assets:vfx-audio": "node scripts/validate-vfx-audio-assets.mjs"
```

Run:

```powershell
npm.cmd run assets:vfx-audio
npm.cmd test -- --run tests/vfx-audio-assets.test.ts tests/runtime-assets.test.ts
```

- [ ] **Step 7: Commit**

```powershell
git add public/assets/v4 scripts/validate-vfx-audio-assets.mjs THIRD_PARTY_ASSETS.md package.json tests/vfx-audio-assets.test.ts tests/runtime-assets.test.ts
git commit -m "assets: add exclusive skill vfx and audio pack"
```

---

### Task 11: Add Character-Specific Projectile Presentation

**Files:**
- Create: `src/client/projectile-presentation.ts`
- Create: `tests/projectile-presentation.test.ts`
- Modify: `src/client/asset-registry.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/render-quality.test.ts`
- Modify: `tests/weapon-layer.test.ts`

- [ ] **Step 1: Write failing six-profile tests**

```typescript
it("defines a distinct muzzle, core, trail, and impact profile for every character", () => {
  for (const character of CHARACTER_CATALOG) {
    const profile = getProjectilePresentation(character.id);
    expect(profile.muzzle.textureKey).toBeTruthy();
    expect(profile.core.textureKey).toBeTruthy();
    expect(profile.trail.textureKey).toBeTruthy();
    expect(profile.impacts.wall.textureKey).toBeTruthy();
    expect(profile.impacts.player.textureKey).toBeTruthy();
    expect(profile.impacts.shield.textureKey).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/projectile-presentation.test.ts tests/render-quality.test.ts
```

- [ ] **Step 3: Implement immutable projectile profiles**

Each character profile consumes the validated Task 10 assets and defines muzzle, core, trail, local-fire cue, and three impact variants. Trail spacing is measured in world units and keeps the existing distance-based emission policy.

- [ ] **Step 4: Replace shared tint-only rendering**

Resolve the projectile owner from the snapshot and configure pooled views from `getProjectilePresentation(owner.characterId)`. Preserve weapon rotation, projectile collision size, and authoritative projectile movement.

- [ ] **Step 5: Keep visual consistency across devices**

Use world-space trail length and physical DPR rendering. Do not branch on iPhone, tablet, or device performance profile.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- --run tests/projectile-presentation.test.ts tests/render-quality.test.ts tests/weapon-layer.test.ts tests/mobile-performance-policy.test.ts
git add src/client/projectile-presentation.ts src/client/asset-registry.ts src/client/game-scene.ts tests/projectile-presentation.test.ts tests/render-quality.test.ts tests/weapon-layer.test.ts
git commit -m "feat: add character-specific projectile presentation"
```

---

### Task 12: Emit And Render Authoritative Projectile Impact Types

**Files:**
- Modify: `src/server/simulation.ts`
- Modify: `src/client/projectile-presentation.ts`
- Modify: `src/client/game-scene.ts`
- Modify: `tests/simulation.test.ts`
- Modify: `tests/projectile-presentation.test.ts`

- [ ] **Step 1: Write failing impact classification tests**

Test a nearer wall, normal player hit, spawn shield, and skill shield. Assert one impact event is emitted at the swept collision position and that bullet deletion still occurs before any wall penetration.

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/simulation.test.ts tests/projectile-presentation.test.ts
```

- [ ] **Step 3: Record impact events at the collision point**

Add:

```typescript
function recordProjectileImpact(
  world: GameWorld,
  projectile: WorldProjectile,
  kind: ProjectileImpactEvent["kind"],
  position: Vec2,
  targetId: string | null,
): void {
  appendPresentationEvent(world.projectileImpactEvents, {
    eventSeq: world.nextProjectileImpactEventSeq++,
    serverTime: world.now,
    projectileId: projectile.id,
    ownerId: projectile.ownerId,
    targetId,
    kind,
    position,
  }, 32);
}
```

Compute the impact point from the swept hit time before deleting the projectile. Classify spawn immunity and any hit with positive skill-shield absorption as `shield`; health damage as `player`; wall sweep as `wall`. If a skill shield absorbs only part of the shot, emit one `shield` event rather than a second player event.

- [ ] **Step 4: Deduplicate and render impacts**

Track nullable `lastProjectileImpactEventSeq` in the scene with the same first-snapshot baseline rule as skill events, so reload/reconnect does not replay historical impacts. Select the owner character profile and play the matching pooled impact. Only nearby/local impacts request audio.

- [ ] **Step 5: Run collision and load tests**

```powershell
npm.cmd test -- --run tests/simulation.test.ts tests/collision.test.ts tests/projectile-presentation.test.ts tests/v4-load-test.test.ts
```

Expected: zero wall penetrations and no duplicate impact effects.

- [ ] **Step 6: Commit**

```powershell
git add src/server/simulation.ts src/client/projectile-presentation.ts src/client/game-scene.ts tests/simulation.test.ts tests/projectile-presentation.test.ts
git commit -m "feat: render authoritative projectile impacts"
```

---

### Task 13: Add Map Ambience, Ducking, And Audio Controls

**Files:**
- Create: `src/client/environment-audio.ts`
- Create: `tests/environment-audio.test.ts`
- Modify: `src/client/combat-audio.ts`
- Modify: `src/client/asset-registry.ts`
- Modify: `src/client/mobile-app.ts`
- Modify: `src/client/styles.css`
- Modify: `tests/mobile-audio-ui.test.ts`
- Modify: `tests/asset-registry.test.ts`

- [ ] **Step 1: Write failing ambience lifecycle tests**

```typescript
it("crossfades maps and ducks ambience during warnings", () => {
  const state = createEnvironmentAudioState();
  expect(updateEnvironmentAudio(state, { mapId: "reactor-core", warning: false }).targetGain).toBeGreaterThan(0);
  expect(updateEnvironmentAudio(state, { mapId: "reactor-core", warning: true }).targetGain).toBeLessThan(0.5);
  expect(updateEnvironmentAudio(state, { mapId: "neon-docks", warning: false }).activeMapId).toBe("neon-docks");
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --run tests/environment-audio.test.ts tests/mobile-audio-ui.test.ts
```

- [ ] **Step 3: Implement environment state and sample lifecycle**

One validated Task 10 loop exists per active map. Crossfade over a bounded interval, stop and disconnect the previous source after fade, and rebuild safely after AudioContext resume. Register the three ambience URLs in `asset-registry.ts`; a missing or undecodable file falls back to the map's existing procedural texture without breaking the mixer.

- [ ] **Step 4: Add warning ducking**

Map-mechanic warning and activation temporarily lower ambience and low-priority remote weapon buses. Local kill/death and local skill buses are never ducked by ambience.

- [ ] **Step 5: Add compact controls**

Add effects and ambience range inputs to the existing controls dialog. Persist values as numbers clamped to `[0, 1]`; mute remains the master switch.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- --run tests/environment-audio.test.ts tests/combat-audio.test.ts tests/mobile-audio-ui.test.ts tests/asset-registry.test.ts
git add src/client/environment-audio.ts src/client/combat-audio.ts src/client/asset-registry.ts src/client/mobile-app.ts src/client/styles.css tests/environment-audio.test.ts tests/combat-audio.test.ts tests/mobile-audio-ui.test.ts tests/asset-registry.test.ts
git commit -m "feat: add map ambience and audio mix controls"
```

---

### Task 14: Full Integration, Visual QA, And Six-Player Gate

**Files:**
- Modify only if a gate exposes a reproducible defect.
- Modify after all gates: `README.md`, `package.json`, `package-lock.json`
- Record local evidence: `artifacts/qa/exclusive-vfx-audio/`

- [ ] **Step 1: Run all automated gates**

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run assets:v3
npm.cmd run assets:v4
npm.cmd run assets:vfx-audio
npm.cmd run smoke:clean-clone
npm.cmd run doctor
git diff --check
```

Expected: zero failures and complete runtime assets in a clean clone.

- [ ] **Step 2: Run six-character scripted pressure tests**

Exercise all six skills, simultaneous projectiles, all impact types, three maps, map warnings, deaths, reconnect, and repeated matches. Require no pool exhaustion, unbounded event history, duplicate stage playback, or wall penetration.

- [ ] **Step 3: Run rendered desktop and mobile QA**

Capture each character at telegraph, cast, active, and end on desktop and 932x430 mobile landscape. Also capture simultaneous six-player skill pressure, character-specific projectiles, each impact type, audio controls, and each map ambience state.

Inspect for silhouette loss, effect overlap, stale effects, missing trails, clipped HUD, unsafe-area collisions, and unreadable indicators.

- [ ] **Step 4: Verify real iPhone audio behavior**

On a real iPhone:

- unlock audio with the first gesture;
- background and resume Safari;
- verify local skill, kill, projectile, map warning, and ambience playback;
- verify no sound before unlock and no stale sound replay after resume;
- confirm effects and ambience sliders persist.

- [ ] **Step 5: Run a 30-minute six-player soak**

Use one real phone and one desktop client, fill remaining seats with bots, rotate all three maps, and complete repeated matches. Record RTT, input P95, longest frame, corrections, reconnect count, server step overruns, pool exhaustion, and audio voice saturation.

Acceptance: no disconnect loop, stuck input, wall penetration, friendly fire, missing skill stage, stuck audio loop, clipped mix, blank report, or sustained visible hitching.

- [ ] **Step 6: Update documentation and version only after acceptance**

Add README release notes describing six four-stage skill packages, six projectile identities, authoritative impact types, map ambience, audio controls, asset licenses, and test evidence. Update version files to the release number selected at execution time.

- [ ] **Step 7: Final commit**

```powershell
git add README.md package.json package-lock.json src tests public scripts THIRD_PARTY_ASSETS.md
git commit -m "feat: complete exclusive skill vfx and audio upgrade"
```

Do not push or publish until the user explicitly requests it.
