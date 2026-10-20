import type { HotspotShape } from './types';

/** Point-in-shape test in normalized image coordinates (0..1 on each axis; a circle's `r` applies to both axes). */
export function pointInShape(p: { x: number; y: number }, shape: HotspotShape): boolean {
  switch (shape.kind) {
    case 'rect':
      return p.x >= shape.x && p.x <= shape.x + shape.w && p.y >= shape.y && p.y <= shape.y + shape.h;
    case 'circle': {
      const dx = (p.x - shape.cx) / shape.r;
      const dy = (p.y - shape.cy) / shape.r;
      return dx * dx + dy * dy <= 1;
    }
    case 'polygon': {
      // even-odd ray casting
      const pts = shape.points;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }
  }
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** |given - value| <= max(tolerance, |value| * relativeTolerance) (shared by numeric and numeric_grid). */
export function withinTolerance(given: number | null, value: number, tolerance = 0, relativeTolerance = 0): boolean {
  if (given === null || !Number.isFinite(given)) return false;
  const allowed = Math.max(tolerance, Math.abs(value) * relativeTolerance);
  return Math.abs(given - value) <= allowed + 1e-12;
}
