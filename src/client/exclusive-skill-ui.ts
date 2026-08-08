import type { ExclusiveSkillId } from "../shared/exclusive-skill-catalog";

export interface ExclusiveSkillButtonPlayer {
  alive: boolean;
  characterId: string;
  exclusiveSkillReadyAt?: number;
  exclusiveSkillState?: { skillId: ExclusiveSkillId; expiresAt: number; anchor?: { x: number; y: number } } | null;
}

export type ExclusiveSkillButtonMode = "dead" | "cooldown" | "ready" | "anchor-return";

export function exclusiveSkillButtonMode(player: ExclusiveSkillButtonPlayer | undefined, serverTime: number): ExclusiveSkillButtonMode {
  if (!player?.alive) return "dead";
  if (player.characterId === "blaze" && player.exclusiveSkillState?.skillId === "breach" && player.exclusiveSkillState.anchor && serverTime < player.exclusiveSkillState.expiresAt) return "anchor-return";
  return Math.max(0, (player.exclusiveSkillReadyAt ?? 0) - serverTime) > 0 ? "cooldown" : "ready";
}

export function canPressExclusiveSkill(player: ExclusiveSkillButtonPlayer | undefined, serverTime: number): boolean {
  const mode = exclusiveSkillButtonMode(player, serverTime);
  return mode === "ready" || mode === "anchor-return";
}
