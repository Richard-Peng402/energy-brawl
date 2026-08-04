import { describe, expect, it } from "vitest";

import { normalizeStickVector, VirtualStick } from "../src/client/virtual-stick";

describe("virtual stick math", () => {
  it("keeps values inside the unit circle", () => {
    expect(normalizeStickVector(30, 40, 100)).toMatchObject({ x: 0.3, y: 0.4, magnitude: 0.5 });
    const clamped = normalizeStickVector(300, 400, 100);
    expect(clamped.x).toBeCloseTo(0.6);
    expect(clamped.y).toBeCloseTo(0.8);
    expect(clamped.magnitude).toBe(1);
  });

  it("returns a stable zero vector", () => {
    expect(normalizeStickVector(0, 0, 0)).toEqual({ x: 0, y: 0, magnitude: 0 });
  });

  it("uses the accepted pointer location as a floating origin", () => {
    const fixture = createStick();
    fixture.zone.dispatch("pointerdown", { pointerId: 1, clientX: 80, clientY: 60 });
    fixture.zone.dispatch("pointermove", { pointerId: 1, clientX: 112, clientY: 84 });

    expect(fixture.stick.getValue().x).toBeCloseTo(0.5);
    expect(fixture.stick.getValue().y).toBeCloseTo(0.375);
    expect(fixture.visual.style.transform).toContain("80px");
    expect(fixture.visual.style.transform).toContain("60px");
  });

  it("ignores another pointer and resets on cancellation", () => {
    const fixture = createStick();
    fixture.zone.dispatch("pointerdown", { pointerId: 7, clientX: 100, clientY: 100 });
    fixture.zone.dispatch("pointermove", { pointerId: 8, clientX: 140, clientY: 100 });
    expect(fixture.stick.getValue()).toEqual({ x: 0, y: 0, magnitude: 0 });

    fixture.zone.dispatch("pointercancel", { pointerId: 7, clientX: 100, clientY: 100 });
    expect(fixture.stick.getValue()).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(fixture.visual.classList.contains("is-active")).toBe(false);
  });

  it("keeps simultaneous left and right sticks independent", () => {
    const left = createStick();
    const right = createStick();
    left.zone.dispatch("pointerdown", { pointerId: 1, clientX: 20, clientY: 40 });
    right.zone.dispatch("pointerdown", { pointerId: 2, clientX: 200, clientY: 40 });
    left.zone.dispatch("pointermove", { pointerId: 1, clientX: 52, clientY: 40 });

    expect(left.stick.getValue().magnitude).toBeGreaterThan(0);
    expect(right.stick.getValue()).toEqual({ x: 0, y: 0, magnitude: 0 });
  });
});

function createStick(): { zone: FakeElement; visual: FakeElement; stick: VirtualStick } {
  const zone = new FakeElement();
  const visual = new FakeElement();
  visual.child = new FakeElement();
  return { zone, visual, stick: new VirtualStick(zone as unknown as HTMLElement, visual as unknown as HTMLElement, 64) };
}

class FakeElement extends EventTarget {
  readonly style: Record<string, string> = {};
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  };
  private readonly classes = new Set<string>();
  private readonly bounds = { left: 0, top: 0, width: 400, height: 200 };
  child: FakeElement | null = null;

  getBoundingClientRect(): DOMRect {
    return this.bounds as DOMRect;
  }

  setPointerCapture(_pointerId: number): void {}
  releasePointerCapture(_pointerId: number): void {}
  hasPointerCapture(_pointerId: number): boolean { return true; }
  querySelector<T>(): T | null { return this.child as T | null; }

  dispatch(type: string, values: Partial<PointerEvent>): void {
    const event = new Event(type, { cancelable: true }) as PointerEvent;
    Object.assign(event, values);
    this.dispatchEvent(event);
  }
}
