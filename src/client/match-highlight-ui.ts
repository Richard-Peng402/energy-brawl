import type { CharacterId } from "../shared/character-catalog";
import type { MatchHighlight } from "../shared/match-highlights";
import { CHARACTER_SELECTION_ASSETS } from "./asset-registry";

interface HighlightPlayer {
  id: string;
  characterId: CharacterId;
}

export function renderMatchHighlights(
  highlights: readonly MatchHighlight[],
  players: readonly HighlightPlayer[] = [],
): string {
  if (highlights.length === 0) return "";
  const characterByPlayer = new Map(players.map((player) => [player.id, player.characterId] as const));
  const cards = highlights.slice(0, 4).map((highlight) => {
    const characterId = characterByPlayer.get(highlight.playerId);
    const portrait = characterId
      ? `<img src="${CHARACTER_SELECTION_ASSETS[characterId]}" alt="" aria-hidden="true" />`
      : `<span class="match-highlight-fallback" aria-hidden="true">${escapeHtml(highlight.playerName.slice(0, 1))}</span>`;
    const copy = highlightCopy(highlight);
    return `<article class="match-highlight-card" data-highlight-kind="${highlight.kind}">
      <div class="match-highlight-portrait">${portrait}</div>
      <div><span>${copy.label}</span><b>${escapeHtml(highlight.playerName)}</b><small>${escapeHtml(copy.detail)}</small></div>
    </article>`;
  }).join("");

  return `<section class="match-highlights" aria-label="本局高光">${cards}</section>`;
}

function highlightCopy(highlight: MatchHighlight): { label: string; detail: string } {
  switch (highlight.kind) {
    case "five-kill-streak":
      return { label: "火力统治", detail: `${formatStreak(highlight.value)}连杀` };
    case "capture-comeback":
      return { label: "据点逆转", detail: `落后 ${Math.max(0, Math.round(highlight.value))} 分后反超` };
    case "critical-healing":
      return {
        label: "关键治疗",
        detail: highlight.targetPlayerName
          ? `救下 ${highlight.targetPlayerName} · ${Math.max(0, Math.round(highlight.value))} 治疗`
          : `${Math.max(0, Math.round(highlight.value))} 治疗`,
      };
    case "hazard-escape":
      return { label: "危险区逃生", detail: "预警结束前成功脱险" };
  }
}

function formatStreak(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  return ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][rounded] ?? String(rounded);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}
