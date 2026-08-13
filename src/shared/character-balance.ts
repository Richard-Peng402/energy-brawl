import type { CharacterId } from "./character-catalog";

export interface CharacterBalance {
  id: CharacterId;
  maxHealth: number;
  damage: number;
  moveSpeed: number;
  fireCooldownMs: number;
  projectileSpeed: number;
  ttkReferenceMs: number;
  shotCountToDefeat100: number;
}

export const CHARACTER_BALANCE: readonly CharacterBalance[] = [
  { id: "blaze", maxHealth: 104, damage: 24, moveSpeed: 272, fireCooldownMs: 600, projectileSpeed: 660, ttkReferenceMs: 2_400, shotCountToDefeat100: 5 },
  { id: "medic", maxHealth: 108, damage: 18, moveSpeed: 255, fireCooldownMs: 560, projectileSpeed: 620, ttkReferenceMs: 2_800, shotCountToDefeat100: 6 },
  { id: "fortress", maxHealth: 136, damage: 20, moveSpeed: 225, fireCooldownMs: 650, projectileSpeed: 570, ttkReferenceMs: 2_600, shotCountToDefeat100: 5 },
  { id: "arc", maxHealth: 96, damage: 14, moveSpeed: 258, fireCooldownMs: 360, projectileSpeed: 680, ttkReferenceMs: 2_520, shotCountToDefeat100: 8 },
  { id: "phase", maxHealth: 88, damage: 30, moveSpeed: 248, fireCooldownMs: 900, projectileSpeed: 880, ttkReferenceMs: 2_700, shotCountToDefeat100: 4 },
  { id: "runner", maxHealth: 92, damage: 18, moveSpeed: 310, fireCooldownMs: 500, projectileSpeed: 650, ttkReferenceMs: 2_500, shotCountToDefeat100: 6 },
];

const BY_ID = new Map(CHARACTER_BALANCE.map((character) => [character.id, character]));

export function getCharacterBalance(id: CharacterId): CharacterBalance {
  const balance = BY_ID.get(id);
  if (!balance) throw new Error(`Unknown character balance: ${id}`);
  return balance;
}
