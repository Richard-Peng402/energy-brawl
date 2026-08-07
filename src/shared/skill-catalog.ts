export type SkillType = "dash" | "shield" | "spread" | "heal";

export interface SkillDefinition {
  type: SkillType;
  name: string;
  shortDescription: string;
}

export const SKILL_TYPES: readonly SkillType[] = ["dash", "shield", "spread", "heal"];

export const SKILL_CATALOG: Readonly<Record<SkillType, SkillDefinition>> = {
  dash: { type: "dash", name: "推进冲刺", shortDescription: "朝移动方向快速突进" },
  shield: { type: "shield", name: "能量护盾", shortDescription: "短时间免疫伤害" },
  spread: { type: "spread", name: "散射齐发", shortDescription: "向瞄准方向发射扇形弹幕" },
  heal: { type: "heal", name: "应急治疗", shortDescription: "立即恢复生命" },
};

export function isSkillType(value: unknown): value is SkillType {
  return typeof value === "string" && SKILL_TYPES.includes(value as SkillType);
}
