export interface PointerAim {
  x: number;
  y: number;
  magnitude: number;
}

export interface ClientBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Converts a mouse position to a normalized direction from the arena centre. */
export function resolveMouseAim(clientX: number, clientY: number, bounds: ClientBounds): PointerAim {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0, magnitude: 0 };
  const deltaX = clientX - bounds.left - bounds.width / 2;
  const deltaY = clientY - bounds.top - bounds.height / 2;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 0.001) return { x: 0, y: 0, magnitude: 0 };
  return { x: deltaX / length, y: deltaY / length, magnitude: 1 };
}

export function resolveHeldSkillAim(pointerAim: PointerAim, fallback: { x: number; y: number }): { x: number; y: number } {
  return pointerAim.magnitude > 0.08
    ? { x: pointerAim.x, y: pointerAim.y }
    : { x: fallback.x, y: fallback.y };
}
