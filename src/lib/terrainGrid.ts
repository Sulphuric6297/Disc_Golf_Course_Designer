// The terrain: heights (ft) at the corners of a square grid, keyed "x,y" in plan feet.
import type { P } from "../types";

/** Ground height at a plan point (bilinear between grid points; 0 where there is no data). */
export const heightAt = (heights: Record<string, number>, gridSize: number, x: number, y: number) => {
  const grid = gridSize || 20;
  const fx = x / grid;
  const fy = y / grid;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const at = (gx: number, gy: number) => heights[`${gx * grid},${gy * grid}`] || 0;
  const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
  const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
  return top * (1 - ty) + bottom * ty;
};

/** Heights along a line (`samples` + 1 evenly spaced points), with the distance of each from the start. */
export const profileAlong = (heights: Record<string, number>, gridSize: number, pts: P[], samples = 64) => {
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = lens[lens.length - 1];
  const out: { d: number; h: number; x: number; y: number }[] = [];
  if (pts.length < 2 || total <= 0) return out;
  let seg = 1;
  for (let s = 0; s <= samples; s++) {
    const d = (s / samples) * total;
    while (seg < pts.length - 1 && lens[seg] < d) seg++;
    const a = pts[seg - 1], b = pts[seg];
    const t = (d - lens[seg - 1]) / Math.max(1e-9, lens[seg] - lens[seg - 1]);
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    out.push({ d, h: heightAt(heights, gridSize, x, y), x, y });
  }
  return out;
};

export const terrainStats = (heights: Record<string, number>) => {
  let min = 0;
  let max = 0;
  let count = 0;
  for (const key in heights) {
    const v = heights[key];
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
    count++;
  }
  return { min, max, relief: max - min, count };
};
