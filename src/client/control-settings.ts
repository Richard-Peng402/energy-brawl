import type { Vec2 } from "../shared/protocol";

export type ControlAction = "moveUp" | "moveDown" | "moveLeft" | "moveRight" | "fire" | "skill" | "exclusiveSkill";

export interface KeyBindings extends Record<ControlAction, string> {}

export interface TouchControlLayout {
  skillX: number;
  skillY: number;
  exclusiveX: number;
  exclusiveY: number;
  scale: number;
}

export interface ControlSettings {
  keys: KeyBindings;
  touch: TouchControlLayout;
}

export interface KeyboardControlState {
  move: Vec2;
  firing: boolean;
  skill: boolean;
  exclusiveSkill: boolean;
}

export const CONTROL_SETTINGS_KEY = "energy-brawl.controls.v1";
export const CONTROL_ACTIONS: readonly ControlAction[] = ["moveUp", "moveDown", "moveLeft", "moveRight", "fire", "skill", "exclusiveSkill"];
export const CONTROL_ACTION_LABELS: Readonly<Record<ControlAction, string>> = {
  moveUp: "向上移动",
  moveDown: "向下移动",
  moveLeft: "向左移动",
  moveRight: "向右移动",
  fire: "普通攻击",
  skill: "技能球技能",
  exclusiveSkill: "角色专属技能",
};

export const DEFAULT_CONTROL_SETTINGS: Readonly<ControlSettings> = {
  keys: {
    moveUp: "KeyW",
    moveDown: "KeyS",
    moveLeft: "KeyA",
    moveRight: "KeyD",
    fire: "Space",
    skill: "KeyQ",
    exclusiveSkill: "KeyE",
  },
  touch: {
    skillX: 0.91,
    skillY: 0.53,
    exclusiveX: 0.77,
    exclusiveY: 0.53,
    scale: 1,
  },
};

export function normalizeControlSettings(input: unknown): ControlSettings {
  const candidate = isRecord(input) ? input : {};
  const candidateKeys = isRecord(candidate.keys) ? candidate.keys : {};
  const candidateTouch = isRecord(candidate.touch) ? candidate.touch : {};
  const keys = {} as KeyBindings;
  const used = new Set<string>();

  for (const action of CONTROL_ACTIONS) {
    const requested = validCode(candidateKeys[action]) ? candidateKeys[action] : DEFAULT_CONTROL_SETTINGS.keys[action];
    const fallback = DEFAULT_CONTROL_SETTINGS.keys[action];
    const code = !used.has(requested)
      ? requested
      : !used.has(fallback)
        ? fallback
        : firstAvailableDefault(used);
    keys[action] = code;
    used.add(code);
  }

  return {
    keys,
    touch: {
      skillX: clampNumber(candidateTouch.skillX, DEFAULT_CONTROL_SETTINGS.touch.skillX, 0.06, 0.94),
      skillY: clampNumber(candidateTouch.skillY, DEFAULT_CONTROL_SETTINGS.touch.skillY, 0.08, 0.92),
      exclusiveX: clampNumber(candidateTouch.exclusiveX, DEFAULT_CONTROL_SETTINGS.touch.exclusiveX, 0.06, 0.94),
      exclusiveY: clampNumber(candidateTouch.exclusiveY, DEFAULT_CONTROL_SETTINGS.touch.exclusiveY, 0.08, 0.92),
      scale: clampNumber(candidateTouch.scale, DEFAULT_CONTROL_SETTINGS.touch.scale, 0.75, 1.35),
    },
  };
}

export function loadControlSettings(storage: Pick<Storage, "getItem">): ControlSettings {
  try {
    const value = storage.getItem(CONTROL_SETTINGS_KEY);
    return normalizeControlSettings(value ? JSON.parse(value) : null);
  } catch {
    return normalizeControlSettings(null);
  }
}

export function saveControlSettings(storage: Pick<Storage, "setItem">, settings: ControlSettings): void {
  try {
    storage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify(normalizeControlSettings(settings)));
  } catch {
    // Storage can be unavailable in private browsing; controls still work for this session.
  }
}

export function resolveKeyboardControl(pressed: ReadonlySet<string>, bindings: KeyBindings): KeyboardControlState {
  const rawX = Number(pressed.has(bindings.moveRight)) - Number(pressed.has(bindings.moveLeft));
  const rawY = Number(pressed.has(bindings.moveDown)) - Number(pressed.has(bindings.moveUp));
  const length = Math.hypot(rawX, rawY);
  return {
    move: length > 0 ? { x: rawX / length, y: rawY / length } : { x: 0, y: 0 },
    firing: pressed.has(bindings.fire),
    skill: pressed.has(bindings.skill),
    exclusiveSkill: pressed.has(bindings.exclusiveSkill),
  };
}

export function formatKeyCode(code: string): string {
  if (code === "Space") return "空格";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code.replace(/^Arrow/, "方向键").replace("ShiftLeft", "左 Shift").replace("ShiftRight", "右 Shift");
}

function firstAvailableDefault(used: ReadonlySet<string>): string {
  for (const action of CONTROL_ACTIONS) {
    const code = DEFAULT_CONTROL_SETTINGS.keys[action];
    if (!used.has(code)) return code;
  }
  let index = 1;
  while (used.has(`F${index}`)) index += 1;
  return `F${index}`;
}

function validCode(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2 && value.length <= 32;
}

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
