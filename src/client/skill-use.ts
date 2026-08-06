import type { PlayerSnapshot } from "../shared/protocol";

export function skillUseBlockReason(player: PlayerSnapshot | undefined): string | null {
  if (!player?.alive) return "等待复活";
  if (player.skillSlot.charges !== 1 || !player.skillSlot.type) return "技能槽为空";
  if (player.skillSlot.type === "heal" && player.health >= player.maxHealth) return "生命已满";
  return null;
}
