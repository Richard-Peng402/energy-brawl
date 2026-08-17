import {
  TACTICAL_MODULES,
  type TacticalModuleId,
} from "../shared/tactical-module-catalog";

export function renderTacticalModuleCards(selectedId: TacticalModuleId, ready: boolean): string {
  return `<div class="tactical-module-section"><div class="tactical-module-heading"><b>战术模组</b><span>每局可重新选择</span></div><div class="tactical-module-list" role="radiogroup" aria-label="选择战术模组">${TACTICAL_MODULES.map((module) => {
    const selected = module.id === selectedId;
    return `<button class="tactical-module-option${selected ? " is-selected" : ""}" type="button" role="radio" data-tactical-module-id="${module.id}" aria-pressed="${selected}" aria-checked="${selected}"${ready ? " disabled" : ""}><strong>${module.name}</strong><span>${module.summary}</span><small><b>收益</b>${module.benefit}</small><small><b>代价</b>${module.tradeoff}</small><small><b>反制</b>${module.counterplay}</small></button>`;
  }).join("")}</div></div>`;
}
