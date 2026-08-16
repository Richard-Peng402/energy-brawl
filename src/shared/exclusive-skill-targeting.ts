import { circleHitsRect, normalize } from "./math";
import { moveCircleUntilBlocked } from "./collision";
import type { ExclusiveSkillId } from "./exclusive-skill-catalog";
import type { Rect, Vec2 } from "./protocol";

export interface ExclusiveSkillTargetingInput {
  skillId: ExclusiveSkillId;
  origin: Vec2;
  direction: Vec2;
  range: number;
  bounds: { width: number; height: number };
  playerRadius: number;
  walls: readonly Rect[];
}

export interface ExclusiveSkillTargetingResult {
  endpoint: Vec2;
  path: { from: Vec2; to: Vec2 };
  valid: boolean;
}

export function resolveExclusiveSkillTargeting(
  input: ExclusiveSkillTargetingInput,
): ExclusiveSkillTargetingResult {
  const length = Math.hypot(input.direction.x, input.direction.y);
  const direction = length > 0.08 ? normalize(input.direction) : { x: 1, y: 0 };
  const range = Math.max(0, Number.isFinite(input.range) ? input.range : 0);
  const rawEndpoint = {
    x: input.origin.x + direction.x * range,
    y: input.origin.y + direction.y * range,
  };
  const clampedEndpoint = {
    x: Math.min(input.bounds.width - input.playerRadius, Math.max(input.playerRadius, rawEndpoint.x)),
    y: Math.min(input.bounds.height - input.playerRadius, Math.max(input.playerRadius, rawEndpoint.y)),
  };

  let endpoint = input.origin;
  let valid = true;
  if (input.skillId === "breach") {
    endpoint = moveCircleUntilBlocked(
      input.origin,
      { x: rawEndpoint.x - input.origin.x, y: rawEndpoint.y - input.origin.y },
      input.playerRadius,
      input.walls,
      input.bounds,
    );
    valid = Math.hypot(endpoint.x - input.origin.x, endpoint.y - input.origin.y) > 1;
  } else if (input.skillId === "phase-shift") {
    endpoint = clampedEndpoint;
    const insideBounds = endpoint.x === rawEndpoint.x && endpoint.y === rawEndpoint.y;
    valid = insideBounds && !input.walls.some((wall) => circleHitsRect(endpoint, input.playerRadius, wall));
  }

  return {
    endpoint: { ...endpoint },
    path: { from: { ...input.origin }, to: { ...endpoint } },
    valid,
  };
}
