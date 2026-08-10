export interface RenderMetrics {
  logicalWidth: number;
  logicalHeight: number;
  physicalWidth: number;
  physicalHeight: number;
  dpr: number;
}

export function resolveRenderMetrics(logicalWidth: number, logicalHeight: number, devicePixelRatio: number): RenderMetrics {
  const safeWidth = Math.max(1, Math.round(logicalWidth));
  const safeHeight = Math.max(1, Math.round(logicalHeight));
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return {
    logicalWidth: safeWidth,
    logicalHeight: safeHeight,
    physicalWidth: Math.max(1, Math.round(safeWidth * dpr)),
    physicalHeight: Math.max(1, Math.round(safeHeight * dpr)),
    dpr,
  };
}
