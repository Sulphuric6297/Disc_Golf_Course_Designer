import { clamp } from "../constants";


export const getTerrainStats = (heights: Record<string, number>) => {
  let min = 0;
  let max = 0;
  let count = 0;
  for (const key in heights) {
    const v = heights[key];
    if (!Number.isFinite(v)) continue;
    // Missing vertices are ground level (0), so 0 is always within range.
    min = Math.min(min, v);
    max = Math.max(max, v);
    count++;
  }
  return { min, max, relief: max - min, count };
};

// Picks a "nice" contour interval (1, 2, 5, 10... ft) giving roughly 8-15 lines across the relief.
export const getContourInterval = (relief: number) => {
  if (relief <= 0) return 1;
  const raw = relief / 10;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const nice = [1, 2, 5, 10].map(m => m * pow).find(v => v >= raw) ?? 10 * pow;
  return Math.max(0.5, nice);
};

// Elevation color ramp: low = deep green, mid = tan, high = brown/white.
export const ELEVATION_RAMP: [number, [number, number, number]][] = [
  [0, [34, 94, 64]],
  [0.25, [84, 140, 74]],
  [0.5, [196, 182, 112]],
  [0.75, [168, 112, 66]],
  [1, [240, 236, 228]]
];
export const elevationColor = (t: number): [number, number, number] => {
  const v = clamp(t, 0, 1);
  for (let i = 1; i < ELEVATION_RAMP.length; i++) {
    const [p1, c1] = ELEVATION_RAMP[i];
    const [p0, c0] = ELEVATION_RAMP[i - 1];
    if (v <= p1) {
      const k = (v - p0) / (p1 - p0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return ELEVATION_RAMP[ELEVATION_RAMP.length - 1][1];
};

// Marching-squares contour segments over the terrain vertex grid (world/plan coordinates).
export const computeContourSegments = (
  heights: Record<string, number>,
  grid: number,
  width: number,
  height: number,
  interval: number,
  minH: number,
  maxH: number
) => {
  const segments: { x1: number; y1: number; x2: number; y2: number; level: number }[] = [];
  if (interval <= 0 || maxH - minH <= 0) return segments;
  const cols = Math.floor(width / grid);
  const rows = Math.floor(height / grid);
  const h = (ix: number, iy: number) => heights[`${ix * grid},${iy * grid}`] ?? 0;
  const firstLevel = Math.ceil(minH / interval) * interval;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const a = h(ix, iy);
      const b = h(ix + 1, iy);
      const c = h(ix + 1, iy + 1);
      const d = h(ix, iy + 1);
      const lo = Math.min(a, b, c, d);
      const hi = Math.max(a, b, c, d);
      if (hi - lo < 1e-6) continue;
      const x0 = ix * grid;
      const y0 = iy * grid;
      for (let level = Math.max(firstLevel, Math.ceil(lo / interval) * interval); level <= hi; level += interval) {
        if (level <= lo || level > hi) continue;
        const pts: { x: number; y: number }[] = [];
        const edge = (h1: number, h2: number, p1: { x: number; y: number }, p2: { x: number; y: number }) => {
          if ((h1 < level) === (h2 < level)) return;
          const t = (level - h1) / (h2 - h1);
          pts.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
        };
        const pa = { x: x0, y: y0 };
        const pb = { x: x0 + grid, y: y0 };
        const pc = { x: x0 + grid, y: y0 + grid };
        const pd = { x: x0, y: y0 + grid };
        edge(a, b, pa, pb);
        edge(b, c, pb, pc);
        edge(c, d, pc, pd);
        edge(d, a, pd, pa);
        if (pts.length >= 2) segments.push({ x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, level });
        if (pts.length === 4) segments.push({ x1: pts[2].x, y1: pts[2].y, x2: pts[3].x, y2: pts[3].y, level });
      }
    }
  }
  return segments;
};
