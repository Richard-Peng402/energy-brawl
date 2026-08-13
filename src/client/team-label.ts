import type { TeamId } from "../shared/mode-catalog";

export function teamLabel(teamId: TeamId | null | undefined): string {
  if (teamId === "red") return "红队";
  if (teamId === "blue") return "蓝队";
  if (teamId === "gold") return "金队";
  return "个人";
}
