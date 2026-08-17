import type { CharacterId } from "./character-catalog";

export type TacticalModuleId =
  | "shield-reinforcement"
  | "ballistic-acceleration"
  | "healing-amplifier"
  | "cooldown-converter";

export interface TacticalModuleDefinition {
  id: TacticalModuleId;
  name: string;
  summary: string;
  benefit: string;
  tradeoff: string;
  counterplay: string;
}

export const TACTICAL_MODULES = [
  {
    id: "shield-reinforcement",
    name: "护盾强化",
    summary: "更强护盾换取持盾机动性",
    benefit: "技能护盾容量提高 30%",
    tradeoff: "持盾时移动速度降低 7%",
    counterplay: "持续集火或绕后，利用其持盾减速",
  },
  {
    id: "ballistic-acceleration",
    name: "弹道加速",
    summary: "更快弹道换取射程与命中宽容",
    benefit: "普通子弹速度提高 18%",
    tradeoff: "最大射程降低 12%，碰撞半径降低 10%",
    counterplay: "远距离拉扯并保持横向移动",
  },
  {
    id: "healing-amplifier",
    name: "治疗增幅",
    summary: "强化团队治疗但延后自然恢复",
    benefit: "主动治疗提高 22%，外部治疗提高 10%",
    tradeoff: "脱战回血延后 750ms",
    counterplay: "持续施压并优先逼退治疗来源",
  },
  {
    id: "cooldown-converter",
    name: "冷却转换",
    summary: "更频繁但更弱的专属技能",
    benefit: "专属技能冷却缩短 15%",
    tradeoff: "技能有效维度降低 12%",
    counterplay: "识别短效果，在结束后集中进攻",
  },
] as const satisfies readonly TacticalModuleDefinition[];

const BY_ID = new Map(TACTICAL_MODULES.map((module) => [module.id, module]));

const DEFAULT_BY_CHARACTER: Readonly<Record<CharacterId, TacticalModuleId>> = {
  blaze: "ballistic-acceleration",
  medic: "healing-amplifier",
  fortress: "shield-reinforcement",
  arc: "cooldown-converter",
  phase: "cooldown-converter",
  runner: "ballistic-acceleration",
};

export function isTacticalModuleId(value: unknown): value is TacticalModuleId {
  return typeof value === "string" && BY_ID.has(value as TacticalModuleId);
}

export function getTacticalModule(id: TacticalModuleId): TacticalModuleDefinition {
  const module = BY_ID.get(id);
  if (!module) throw new Error(`Unknown tactical module: ${id}`);
  return module;
}

export function defaultTacticalModuleForCharacter(characterId: CharacterId): TacticalModuleId {
  return DEFAULT_BY_CHARACTER[characterId];
}
