import type { Rect } from "./protocol";

function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export class StaticSpatialIndex {
  private readonly cells = new Map<string, Rect[]>();

  constructor(private readonly rects: readonly Rect[], private readonly cellSize = 240) {
    for (const rect of rects) {
      const minX = Math.floor(rect.x / cellSize);
      const maxX = Math.floor((rect.x + rect.width) / cellSize);
      const minY = Math.floor(rect.y / cellSize);
      const maxY = Math.floor((rect.y + rect.height) / cellSize);
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        for (let cellY = minY; cellY <= maxY; cellY += 1) {
          const key = `${cellX},${cellY}`;
          const members = this.cells.get(key);
          if (members) members.push(rect);
          else this.cells.set(key, [rect]);
        }
      }
    }
  }

  query(bounds: Rect): readonly Rect[] {
    if (bounds.width <= 0 || bounds.height <= 0 || this.rects.length === 0) return [];
    const candidates = new Set<Rect>();
    const minX = Math.floor(bounds.x / this.cellSize);
    const maxX = Math.floor((bounds.x + bounds.width) / this.cellSize);
    const minY = Math.floor(bounds.y / this.cellSize);
    const maxY = Math.floor((bounds.y + bounds.height) / this.cellSize);
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        for (const rect of this.cells.get(`${cellX},${cellY}`) ?? []) candidates.add(rect);
      }
    }
    return this.rects.filter((rect) => candidates.has(rect) && intersects(rect, bounds));
  }
}
