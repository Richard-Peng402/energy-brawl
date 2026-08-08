import type { CharacterId } from "../shared/character-catalog";
import type { Vec2 } from "../shared/protocol";
import type { StickValue } from "./virtual-stick";

const DISPLACEMENT_SKILLS = new Set<CharacterId>(["blaze", "phase"]);

export function isDisplacementSkill(characterId: CharacterId): boolean {
  return DISPLACEMENT_SKILLS.has(characterId);
}

export function resolveSkillStickDirection(stick: StickValue, fallback: Vec2): Vec2 {
  const source = stick.magnitude > 0.08 ? stick : fallback;
  const length = Math.hypot(source.x, source.y);
  return length > 0.0001 ? { x: source.x / length, y: source.y / length } : { x: 1, y: 0 };
}
