import type { Vec2 } from "../shared/protocol";
import { getExclusiveSkill } from "../shared/exclusive-skill-catalog";

export type SkillIndicatorSkill = "blaze" | "medic" | "fortress" | "arc" | "phase" | "runner";
export type SkillIndicatorGeometryKind = "path" | "circle" | "frontal-arc" | "self";
export interface SkillIndicatorState {
  skillId: SkillIndicatorSkill | null;
  origin: Vec2;
  direction: Vec2;
  range: number;
  visible: boolean;
  geometryKind: SkillIndicatorGeometryKind;
  valid: boolean;
  endpoint: Vec2;
  secondaryRadius?: number;
}

export type SkillIndicatorShape = "dash-line" | "heal-radius" | "front-cone" | "buff-aura" | "phase-line" | "afterimage-lane";
export interface SkillIndicatorProfile {
  shape: SkillIndicatorShape;
  range: number;
  thickness: number;
  color: number;
  geometryKind: SkillIndicatorGeometryKind;
  secondaryRadius?: number;
}

const INDICATOR_PROFILES: Readonly<Record<SkillIndicatorSkill, SkillIndicatorProfile>> = {
  blaze: { shape: "dash-line", range: getExclusiveSkill("blaze").balance.dashDistance ?? 340, thickness: 16, color: 0xffa63d, geometryKind: "path" },
  medic: { shape: "heal-radius", range: getExclusiveSkill("medic").balance.radius ?? 280, thickness: 14, color: 0x62f5be, geometryKind: "circle" },
  fortress: { shape: "front-cone", range: getExclusiveSkill("fortress").balance.suppressionRadius ?? 240, thickness: 18, color: 0x63d9ff, geometryKind: "frontal-arc", secondaryRadius: 280 },
  arc: { shape: "buff-aura", range: 120, thickness: 14, color: 0xffd45e, geometryKind: "self" },
  phase: { shape: "phase-line", range: getExclusiveSkill("phase").balance.dashDistance ?? 400, thickness: 16, color: 0xa77bff, geometryKind: "path" },
  runner: { shape: "afterimage-lane", range: 220, thickness: 14, color: 0xff6d94, geometryKind: "self" },
};

export function getSkillIndicatorProfile(skillId: SkillIndicatorSkill): SkillIndicatorProfile {
  return { ...INDICATOR_PROFILES[skillId] };
}

export class SkillIndicatorController {
  private state: SkillIndicatorState = { skillId: null, origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, range: 0, visible: false, geometryKind: "self", valid: true, endpoint: { x: 0, y: 0 } };
  begin(skillId: SkillIndicatorSkill, origin: Vec2, range: number): SkillIndicatorState {
    const profile = getSkillIndicatorProfile(skillId);
    this.state = { skillId, origin: { ...origin }, direction: { x: 1, y: 0 }, range, visible: true, geometryKind: profile.geometryKind, valid: true, endpoint: { x: origin.x + range, y: origin.y }, secondaryRadius: profile.secondaryRadius };
    return this.state;
  }
  update(direction: Vec2): SkillIndicatorState {
    const length = Math.hypot(direction.x, direction.y);
    if (length > 0.08) this.state.direction = { x: direction.x / length, y: direction.y / length };
    this.state.endpoint = { x: this.state.origin.x + this.state.direction.x * this.state.range, y: this.state.origin.y + this.state.direction.y * this.state.range };
    return this.state;
  }
  cancel(): void { this.state.visible = false; }
  release(): SkillIndicatorState { this.state.visible = false; return this.state; }
  snapshot(): SkillIndicatorState { return { ...this.state, origin: { ...this.state.origin }, direction: { ...this.state.direction }, endpoint: { ...this.state.endpoint } }; }
}
