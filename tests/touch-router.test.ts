import { describe, expect, it } from "vitest";

import { TouchRouter, type TouchRole } from "../src/client/touch-router";

describe("touch router", () => {
  it("assigns left and right touches to independent sticks", () => {
    const fixture = createRouter(800);
    expect(fixture.down(1, 120)).toBe("move");
    expect(fixture.down(2, 700)).toBe("aim");
    fixture.movePointer(2, 200);
    expect(fixture.router.owner(1)).toBe("move");
    expect(fixture.router.owner(2)).toBe("aim");
    expect(fixture.aim.moves).toEqual([[2, 200, 100]]);
  });

  it("keeps aim ownership after crossing the midpoint", () => {
    const fixture = createRouter(800);
    fixture.down(4, 700);
    fixture.movePointer(4, 100);
    expect(fixture.router.owner(4)).toBe("aim");
    expect(fixture.move.moves).toEqual([]);
  });

  it("gives a skill button priority over aim", () => {
    const fixture = createRouter(800);
    expect(fixture.down(8, 700, true)).toBe("skill");
    expect(fixture.skillUses).toBe(1);
    expect(fixture.aim.begins).toEqual([]);
  });

  it("rejects a second pointer for an occupied role", () => {
    const fixture = createRouter(800);
    expect(fixture.down(1, 100)).toBe("move");
    expect(fixture.down(2, 200)).toBeNull();
    fixture.router.pointerUp(1);
    expect(fixture.down(2, 200)).toBe("move");
  });

  it("resets all ownership and sticks", () => {
    const fixture = createRouter(800);
    fixture.down(1, 100);
    fixture.down(2, 700);
    fixture.router.resetAll();
    expect(fixture.router.owner(1)).toBeNull();
    expect(fixture.router.owner(2)).toBeNull();
    expect(fixture.move.resets).toBe(1);
    expect(fixture.aim.resets).toBe(1);
  });
});

function createRouter(width: number) {
  const move = new FakeStick();
  const aim = new FakeStick();
  let skillUses = 0;
  const router = new TouchRouter(move, aim, () => width, () => { skillUses += 1; });
  const event = (pointerId: number, clientX: number) => ({
    pointerId,
    clientX,
    clientY: 100,
    preventDefault() {},
  }) as PointerEvent;
  return {
    router,
    move,
    aim,
    get skillUses() { return skillUses; },
    down(pointerId: number, clientX: number, skill = false): TouchRole | null {
      return router.pointerDown(event(pointerId, clientX), skill);
    },
    movePointer(pointerId: number, clientX: number): void {
      router.pointerMove(event(pointerId, clientX));
    },
  };
}

class FakeStick {
  readonly begins: Array<[number, number, number]> = [];
  readonly moves: Array<[number, number, number]> = [];
  resets = 0;
  begin(pointerId: number, x: number, y: number): boolean {
    this.begins.push([pointerId, x, y]);
    return true;
  }
  move(pointerId: number, x: number, y: number): void {
    this.moves.push([pointerId, x, y]);
  }
  end(_pointerId: number): void {}
  reset(): void { this.resets += 1; }
}
