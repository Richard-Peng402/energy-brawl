import type { Vec2 } from "../shared/protocol";

export type SkillIndicatorSkill = "blaze" | "medic" | "fortress" | "arc" | "phase" | "runner";
export interface SkillIndicatorState { skillId: SkillIndicatorSkill | null; origin: Vec2; direction: Vec2; range: number; visible: boolean; }

export class SkillIndicatorController {
  private state: SkillIndicatorState = { skillId: null, origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, range: 0, visible: false };
  begin(skillId: SkillIndicatorSkill, origin: Vec2, range: number): SkillIndicatorState { this.state = { skillId, origin: { ...origin }, direction: { x: 1, y: 0 }, range, visible: true }; return this.state; }
  update(direction: Vec2): SkillIndicatorState { const length = Math.hypot(direction.x, direction.y); if (length > 0.08) this.state.direction = { x: direction.x / length, y: direction.y / length }; return this.state; }
  cancel(): void { this.state.visible = false; }
  release(): SkillIndicatorState { this.state.visible = false; return this.state; }
  snapshot(): SkillIndicatorState { return { ...this.state, origin: { ...this.state.origin }, direction: { ...this.state.direction } }; }
}
