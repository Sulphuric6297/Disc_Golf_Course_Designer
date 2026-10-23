// Painting with a brush: the ground raised, lowered, flattened or smoothed under it (soft at its
// edge, so what's painted blends into the ground round it), and a painted stroke turned into an
// area's outline (smooth all the way round).
import type { P } from "../types";
import { traceOutline } from "./geo/detect";
import { simplify, smoothClosed } from "./geom";

export type GroundBrush = "raise" | "lower" | "flatten" | "smooth";

/** How much a brush does at a distance from its middle: all of it there, none at its edge, easing
 * out in between (a cosine), so a stroke leaves no step at its edge. */
export const falloff = (d: number, r: number) => (d >= r ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / r)));

/**
 * One dab of the ground brush at `at` (plan ft), on heights kept at grid points ("x,y" keys, ft
 * above the site's lowest point), changed in place. `strength`: ft a dab raises or lowers the
 * middle (flatten and smooth: how far toward the level, 0 to 1). `level`: the height flatten
 * levels to. Grid points outside the site are left alone.
 */
export const dab = (heights: Record<string, number>, grid: number, width: number, height: number, at: P, radius: number, brush: GroundBrush, strength: number, level = 0) => {
  const g = grid || 20;
  const i0 = Math.max(0, Math.floor((at.x - radius) / g)), i1 = Math.min(Math.floor(width / g), Math.ceil((at.x + radius) / g));
  const j0 = Math.max(0, Math.floor((at.y - radius) / g)), j1 = Math.min(Math.floor(height / g), Math.ceil((at.y + radius) / g));
  const key = (i: number, j: number) => `${i * g},${j * g}`;
  const hAt = (i: number, j: number) => heights[key(i, j)] ?? 0;
  // (smoothing reads the heights as they were before this dab)
  const before = brush === "smooth" ? new Map<string, number>() : null;
  if (before) for (let j = j0 - 1; j <= j1 + 1; j++) for (let i = i0 - 1; i <= i1 + 1; i++) before.set(key(i, j), hAt(i, j));
  const was = (i: number, j: number) => before!.get(key(i, j)) ?? hAt(i, j);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const w = falloff(Math.hypot(i * g - at.x, j * g - at.y), radius);
    if (w <= 0) continue;
    const k = key(i, j), h = hAt(i, j);
    let next = h;
    if (brush === "raise") next = h + strength * w;
    else if (brush === "lower") next = h - strength * w;
    else if (brush === "flatten") next = h + (level - h) * Math.min(1, strength * w);
    else {
      let sum = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { sum += was(i + a, j + b); n++; }
      next = h + (sum / n - h) * Math.min(1, strength * w);
    }
    heights[k] = Math.round(next * 100) / 100;
  }
};

/** The outline of a painted stroke (a brush of `radius` dragged along `path`): smooth all the way
 * round, its corners rounded off. Null: nothing painted. */
export const strokeOutline = (path: P[], radius: number): P[] | null => {
  if (!path.length || radius <= 0) return null;
  const cell = Math.max(0.75, radius / 6);
  const minX = Math.min(...path.map(p => p.x)) - radius - cell * 2, minY = Math.min(...path.map(p => p.y)) - radius - cell * 2;
  const maxX = Math.max(...path.map(p => p.x)) + radius + cell * 2, maxY = Math.max(...path.map(p => p.y)) + radius + cell * 2;
  const w = Math.ceil((maxX - minX) / cell), h = Math.ceil((maxY - minY) / cell);
  if (w * h > 4_000_000) return null;
  const mask = new Uint8Array(w * h);
  // (discs along the path, close enough together to leave no gaps)
  const r = radius / cell, r2 = r * r;
  const stamp = (p: P) => {
    const cx = (p.x - minX) / cell, cy = (p.y - minY) / cell;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) mask[y * w + x] = 1;
  };
  stamp(path[0]);
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 1.5)));
    for (let s = 1; s <= n; s++) stamp({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n });
  }
  // The biggest painted piece (a stroke crossing itself makes one)
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp: number[] = [], stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const x = k % w, y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  if (best.length < 3) return null;
  const outline = traceOutline(w, h, best).map(p => ({ x: minX + p.x * cell, y: minY + p.y * cell }));
  const simple = simplify([...outline, outline[0]], cell * 0.6).slice(0, -1);
  return simple.length >= 3 ? smoothClosed(simple, 2) : null;
};
