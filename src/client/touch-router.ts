export type TouchRole = "move" | "aim" | "skill";

export interface RoutedStick {
  begin(pointerId: number, clientX: number, clientY: number): boolean;
  move(pointerId: number, clientX: number, clientY: number): void;
  end(pointerId: number): void;
  reset(): void;
}

export class TouchRouter {
  private readonly owners = new Map<number, TouchRole>();
  private readonly activeRoles = new Map<TouchRole, number>();

  constructor(
    private readonly moveStick: RoutedStick,
    private readonly aimStick: RoutedStick,
    private readonly viewportWidth: () => number = () => window.innerWidth,
    private readonly useSkill: () => void = () => undefined,
  ) {}

  pointerDown(event: PointerEvent, skillTarget: boolean): TouchRole | null {
    if (this.owners.has(event.pointerId)) return this.owners.get(event.pointerId) ?? null;
    const role: TouchRole = skillTarget
      ? "skill"
      : event.clientX < this.viewportWidth() / 2
        ? "move"
        : "aim";
    if (this.activeRoles.has(role)) return null;

    const accepted = role === "skill"
      ? true
      : this.stickFor(role).begin(event.pointerId, event.clientX, event.clientY);
    if (!accepted) return null;

    event.preventDefault();
    this.owners.set(event.pointerId, role);
    this.activeRoles.set(role, event.pointerId);
    if (role === "skill") this.useSkill();
    return role;
  }

  pointerMove(event: PointerEvent): TouchRole | null {
    const role = this.owners.get(event.pointerId) ?? null;
    if (role === "move" || role === "aim") {
      event.preventDefault();
      this.stickFor(role).move(event.pointerId, event.clientX, event.clientY);
    }
    return role;
  }

  pointerUp(pointerId: number): void {
    const role = this.owners.get(pointerId);
    if (!role) return;
    if (role === "move" || role === "aim") this.stickFor(role).end(pointerId);
    this.owners.delete(pointerId);
    this.activeRoles.delete(role);
  }

  owner(pointerId: number): TouchRole | null {
    return this.owners.get(pointerId) ?? null;
  }

  resetAll(): void {
    this.owners.clear();
    this.activeRoles.clear();
    this.moveStick.reset();
    this.aimStick.reset();
  }

  private stickFor(role: "move" | "aim"): RoutedStick {
    return role === "move" ? this.moveStick : this.aimStick;
  }
}
