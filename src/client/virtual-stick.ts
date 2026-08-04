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
  ) {
    const knob = visual.querySelector<HTMLElement>(".stick-knob");
    if (!knob) throw new Error("Virtual stick requires a .stick-knob element");
    this.knob = knob;
    zone.addEventListener("pointerdown", this.onPointerDown);
    zone.addEventListener("pointermove", this.onPointerMove);
    zone.addEventListener("pointerup", this.onPointerUp);
    zone.addEventListener("pointercancel", this.onPointerUp);
    zone.addEventListener("lostpointercapture", this.onLostCapture);
    if (typeof window !== "undefined") window.addEventListener("blur", this.reset);
  }

  getValue(): StickValue {
    return { ...this.value };
  }

  dispose(): void {
    this.zone.removeEventListener("pointerdown", this.onPointerDown);
    this.zone.removeEventListener("pointermove", this.onPointerMove);
    this.zone.removeEventListener("pointerup", this.onPointerUp);
    this.zone.removeEventListener("pointercancel", this.onPointerUp);
    this.zone.removeEventListener("lostpointercapture", this.onLostCapture);
    if (typeof window !== "undefined") window.removeEventListener("blur", this.reset);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.activePointerId !== null) return;
    event.preventDefault();
    this.activePointerId = event.pointerId;
    const bounds = this.zone.getBoundingClientRect();
    this.originX = event.clientX - bounds.left;
    this.originY = event.clientY - bounds.top;
    this.visual.style.transform = `translate3d(${this.originX}px, ${this.originY}px, 0)`;
    this.visual.classList.add("is-active");
    this.zone.setPointerCapture(event.pointerId);
    this.updateFromPointer(event);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.updateFromPointer(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    if (this.zone.hasPointerCapture?.(event.pointerId)) this.zone.releasePointerCapture(event.pointerId);
    this.reset();
  };

  private readonly onLostCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.activePointerId) this.reset();
  };

  private readonly reset = (): void => {
    this.activePointerId = null;
    this.value = { x: 0, y: 0, magnitude: 0 };
    this.knob.style.transform = "translate3d(0, 0, 0)";
    this.visual.classList.remove("is-active");
  };

  private updateFromPointer(event: PointerEvent): void {
    event.preventDefault();
    const bounds = this.zone.getBoundingClientRect();
    const deltaX = event.clientX - bounds.left - this.originX;
    const deltaY = event.clientY - bounds.top - this.originY;
    this.value = normalizeStickVector(deltaX, deltaY, this.radius);
    this.knob.style.transform = `translate3d(${this.value.x * this.radius}px, ${this.value.y * this.radius}px, 0)`;
  }
}
