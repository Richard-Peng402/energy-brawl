export interface StickValue {
  x: number;
  y: number;
  magnitude: number;
}

export function normalizeStickVector(deltaX: number, deltaY: number, radius: number): StickValue {
  if (radius <= 0) return { x: 0, y: 0, magnitude: 0 };
  const rawMagnitude = Math.hypot(deltaX, deltaY);
  if (rawMagnitude === 0) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = Math.min(1, rawMagnitude / radius);
  return {
    x: (deltaX / rawMagnitude) * magnitude,
    y: (deltaY / rawMagnitude) * magnitude,
    magnitude,
  };
}

export function clampStickVisualOrigin(
  originX: number,
  originY: number,
  width: number,
  height: number,
  radius: number,
): { x: number; y: number } {
  const edgePadding = radius + 12;
  const center = width / 2;
  const centerReserve = radius + 45;
  const visualX = originX < center
    ? clampToRange(originX, edgePadding, center - centerReserve)
    : clampToRange(originX, center + centerReserve, width - edgePadding);
  return {
    x: visualX,
    y: clampToRange(originY, edgePadding, height - edgePadding),
  };
}

export class VirtualStick {
  private readonly knob: HTMLElement;
  private activePointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private value: StickValue = { x: 0, y: 0, magnitude: 0 };

  constructor(
    private readonly zone: HTMLElement,
    private readonly visual: HTMLElement,
    private readonly radius = 64,
    private readonly listenToZone = true,
  ) {
    const knob = visual.querySelector<HTMLElement>(".stick-knob");
    if (!knob) throw new Error("Virtual stick requires a .stick-knob element");
    this.knob = knob;
    if (listenToZone) this.addZoneListeners();
  }

  getValue(): StickValue {
    return { ...this.value };
  }

  begin(pointerId: number, clientX: number, clientY: number): boolean {
    if (this.activePointerId !== null) return false;
    this.activePointerId = pointerId;
    const bounds = this.zone.getBoundingClientRect();
    this.originX = clientX - bounds.left;
    this.originY = clientY - bounds.top;
    const visualOrigin = clampStickVisualOrigin(
      this.originX,
      this.originY,
      bounds.width,
      bounds.height,
      this.radius,
    );
    this.visual.style.transform = `translate3d(${visualOrigin.x}px, ${visualOrigin.y}px, 0)`;
    this.visual.classList.add("is-active");
    this.update(clientX, clientY);
    return true;
  }

  move(pointerId: number, clientX: number, clientY: number): void {
    if (pointerId !== this.activePointerId) return;
    this.update(clientX, clientY);
  }

  end(pointerId: number): void {
    if (pointerId === this.activePointerId) this.reset();
  }

  reset(): void {
    this.activePointerId = null;
    this.value = { x: 0, y: 0, magnitude: 0 };
    this.knob.style.transform = "translate3d(0, 0, 0)";
    this.visual.classList.remove("is-active");
  }

  dispose(): void {
    if (this.listenToZone) this.removeZoneListeners();
    this.reset();
  }

  private addZoneListeners(): void {
    this.zone.addEventListener("pointerdown", this.onPointerDown);
    this.zone.addEventListener("pointermove", this.onPointerMove);
    this.zone.addEventListener("pointerup", this.onPointerUp);
    this.zone.addEventListener("pointercancel", this.onPointerUp);
    this.zone.addEventListener("lostpointercapture", this.onLostCapture);
    if (typeof window !== "undefined") window.addEventListener("blur", this.onBlur);
  }

  private removeZoneListeners(): void {
    this.zone.removeEventListener("pointerdown", this.onPointerDown);
    this.zone.removeEventListener("pointermove", this.onPointerMove);
    this.zone.removeEventListener("pointerup", this.onPointerUp);
    this.zone.removeEventListener("pointercancel", this.onPointerUp);
    this.zone.removeEventListener("lostpointercapture", this.onLostCapture);
    if (typeof window !== "undefined") window.removeEventListener("blur", this.onBlur);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.begin(event.pointerId, event.clientX, event.clientY)) return;
    event.preventDefault();
    this.zone.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.move(event.pointerId, event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    if (this.zone.hasPointerCapture?.(event.pointerId)) this.zone.releasePointerCapture(event.pointerId);
    this.end(event.pointerId);
  };

  private readonly onLostCapture = (event: PointerEvent): void => {
    this.end(event.pointerId);
  };

  private readonly onBlur = (): void => {
    this.reset();
  };

  private update(clientX: number, clientY: number): void {
    const bounds = this.zone.getBoundingClientRect();
    const deltaX = clientX - bounds.left - this.originX;
    const deltaY = clientY - bounds.top - this.originY;
    this.value = normalizeStickVector(deltaX, deltaY, this.radius);
    this.knob.style.transform = `translate3d(${this.value.x * this.radius}px, ${this.value.y * this.radius}px, 0)`;
  }
}

function clampToRange(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return (minimum + maximum) / 2;
  return Math.min(maximum, Math.max(minimum, value));
}
