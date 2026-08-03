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
  private value: StickValue = { x: 0, y: 0, magnitude: 0 };

  constructor(private readonly element: HTMLElement) {
    const knob = element.querySelector<HTMLElement>(".stick-knob");
    if (!knob) throw new Error("Virtual stick requires a .stick-knob element");
    this.knob = knob;
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("blur", this.reset);
  }

  getValue(): StickValue {
    return { ...this.value };
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("blur", this.reset);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    this.element.setPointerCapture(event.pointerId);
    this.updateFromPointer(event);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.updateFromPointer(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.reset();
  };

  private readonly reset = (): void => {
    this.activePointerId = null;
    this.value = { x: 0, y: 0, magnitude: 0 };
    this.knob.style.transform = "translate3d(0, 0, 0)";
    this.element.classList.remove("is-active");
  };

  private updateFromPointer(event: PointerEvent): void {
    event.preventDefault();
    const bounds = this.element.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) * 0.34;
    const deltaX = event.clientX - (bounds.left + bounds.width / 2);
    const deltaY = event.clientY - (bounds.top + bounds.height / 2);
    this.value = normalizeStickVector(deltaX, deltaY, radius);
    this.knob.style.transform = `translate3d(${this.value.x * radius}px, ${this.value.y * radius}px, 0)`;
    this.element.classList.add("is-active");
  }
}
