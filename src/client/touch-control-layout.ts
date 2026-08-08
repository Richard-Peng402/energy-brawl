import { normalizeControlSettings, type TouchControlLayout } from "./control-settings";

export type MovableTouchControl = "skill" | "exclusive";

export interface ControlBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function moveTouchControl(
  layout: TouchControlLayout,
  control: MovableTouchControl,
  clientX: number,
  clientY: number,
  bounds: ControlBounds,
): TouchControlLayout {
  const x = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0.5;
  const y = bounds.height > 0 ? (clientY - bounds.top) / bounds.height : 0.5;
  return normalizeControlSettings({
    touch: control === "skill"
      ? { ...layout, skillX: x, skillY: y }
      : { ...layout, exclusiveX: x, exclusiveY: y },
  }).touch;
}

export function touchControlStyle(layout: TouchControlLayout, control: MovableTouchControl): Record<"left" | "top" | "transform", string> {
  const x = control === "skill" ? layout.skillX : layout.exclusiveX;
  const y = control === "skill" ? layout.skillY : layout.exclusiveY;
  return {
    left: `${Number((x * 100).toFixed(2))}%`,
    top: `${Number((y * 100).toFixed(2))}%`,
    transform: `translate3d(-50%, -50%, 0) scale(${layout.scale})`,
  };
}
