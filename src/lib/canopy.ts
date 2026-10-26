// Woods from the trees measured from the air: where the canopy stands (the LiDAR canopy height
// over the cleaned ground, about a meter a cell), joined across the small gaps between crowns but
// open at clearings, lanes and fairways, kept off roads, buildings, water and playing fields, its
// outline smoothed only a little. Each stand's measured trees are its own; the others stand alone.
import type { LidarTree, P } from "../types";
import { boundsOf, simplify } from "./geom";
import { traceOutline } from "./geo/detect";

/** How high canopy stands to count (ft over the ground): lower is brush. */
const CANOPY_FT = 10;
/** Gaps among crowns this wide or less (ft) are filled. */
const GAP_FT = 12;
/** A clearing or lane this wide (ft) stays open. */
const CLEARING_FT = 26;
/** The smallest stand (sq ft, about one big crown) and the fewest trees in one. */
const MIN_STAND_SQFT = 1500;
const MIN_STAND_TREES = 3;

/** A wood's outline (plan ft) and the measured trees in it. */
export type CanopyStand = { outline: P[]; trees: number };

/**
 * The stands of woods over a site from its measured canopy: `canopy` ft high in each `cell` ft
 * cell (lidar's measureSite). `keepOut`: shapes no woods covers (buildings, water, parking, playing
 * fields), and lines with their width (roads). Returns each stand's outline and, for every measured
 * tree, whether it stands in one (1) or alone in the open (0).
 */
export const canopyStands = (m: { nx: number; ny: number; cell: number; canopy: Float32Array }, trees: LidarTree[], keepOut: { areas?: P[][]; lines?: { points: P[]; width: number }[] } = {}) => {
  // (about a meter a cell: each the share of its finer cells with canopy)
  const f = Math.max(1, Math.round(3.3 / m.cell)), c2 = f * m.cell;
  const w = Math.ceil(m.nx / f), h = Math.ceil(m.ny / f), n = w * h;
  let mask: Uint8Array = new Uint8Array(n);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let on = 0, all = 0;
    for (let b = j * f; b < Math.min(m.ny, (j + 1) * f); b++) for (let a = i * f; a < Math.min(m.nx, (i + 1) * f); a++) {
      all++;
      if (m.canopy[b * m.nx + a] >= CANOPY_FT) on++;
    }
    if (on * 2 >= all) mask[j * w + i] = 1;
  }
  // Joined across small gaps; then the ground kept out cut away (a road through a wood parts it)
  mask = shrink(grow(mask, w, h, Math.round(GAP_FT / 2 / c2)), w, h, Math.round(GAP_FT / 2 / c2));
  const out = rasterize(keepOut, w, h, c2);
  for (let k = 0; k < n; k++) if (out[k]) mask[k] = 0;
  keepClearings(mask, w, h, CLEARING_FT / c2);
  // Each stand: its cells (four ways), its trees
  const label = new Int32Array(n).fill(-1), comps: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const comp = [s];
    label[s] = comps.length;
    for (let q = 0; q < comp.length; q++) {
      const k = comp[q], x = k % w;
      for (const d of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
        if (d < 0 || d >= n || !mask[d] || label[d] >= 0) continue;
        label[d] = comps.length;
        comp.push(d);
      }
    }
    comps.push(comp);
  }
  const at = (x: number, y: number) => {
    const i = Math.floor(x / c2), j = Math.floor(y / c2);
    return i < 0 || j < 0 || i >= w || j >= h ? -1 : label[j * w + i];
  };
  const count = new Array(comps.length).fill(0);
  for (const t of trees) { const k = at(t[0], t[1]); if (k >= 0) count[k]++; }
  const keep = comps.map((c, k) => c.length * c2 * c2 >= MIN_STAND_SQFT && count[k] >= MIN_STAND_TREES);
  const stands: CanopyStand[] = [];
  comps.forEach((c, k) => {
    if (!keep[k]) return;
    const ring = traceOutline(w, h, c).map(p => ({ x: p.x * c2, y: p.y * c2 }));
    const outline = smooth(simplify(ring, 2.5));
    if (outline.length >= 3) stands.push({ outline, trees: count[k] });
  });
  const inStand = trees.map(t => { const k = at(t[0], t[1]); return k >= 0 && keep[k] ? 1 : 0; });
  return { stands, inStand };
};

/**
 * The holes in a stand sorted out, in place: a clearing at least `across` cells wide (at its
 * widest round spot) stays open, cut through to the open ground outside along the shortest way
 * through the trees (a slit a cell wide), so the stand's one outline goes round it (a woods area
 * has no holes of its own); a smaller gap among the crowns is filled.
 */
const keepClearings = (m: Uint8Array, w: number, h: number, across: number) => {
  const n = w * h;
  // (how far each open cell is from the trees, in cells: a chamfer distance, near enough round)
  const dist = new Float32Array(n);
  for (let k = 0; k < n; k++) dist[k] = m[k] ? 0 : 1e9;
  const pass = (k: number, d: number, step: number) => { if (d >= 0 && d < n && dist[d] + step < dist[k]) dist[k] = dist[d] + step; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (i > 0) pass(k, k - 1, 1);
    if (j > 0) { pass(k, k - w, 1); if (i > 0) pass(k, k - w - 1, 1.4); if (i < w - 1) pass(k, k - w + 1, 1.4); }
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i;
    if (i < w - 1) pass(k, k + 1, 1);
    if (j < h - 1) { pass(k, k + w, 1); if (i < w - 1) pass(k, k + w + 1, 1.4); if (i > 0) pass(k, k + w - 1, 1.4); }
  }
  const seen = new Uint8Array(n), prev = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (m[s] || seen[s]) continue;
    const hole = [s];
    seen[s] = 1;
    let edge = false, widest = 0;
    for (let q = 0; q < hole.length; q++) {
      const k = hole[q], x = k % w, y = (k - x) / w;
      widest = Math.max(widest, dist[k]);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const d of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
        if (d < 0 || d >= n || m[d] || seen[d]) continue;
        seen[d] = 1;
        hole.push(d);
      }
    }
    // (open ground running off the site, or out between the stands: no hole)
    if (edge) continue;
    if (2 * widest < across) { for (const k of hole) m[k] = 1; continue; }
    // From the clearing out through the trees (four ways: a slit a cell wide still parts the trees
    // on its two sides) to open ground that isn't this clearing, or the site's edge
    const mine = new Set(hole), queue = [...hole];
    prev.fill(-2);
    for (const k of hole) prev[k] = -1;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], x = k % w;
      let exit = -1;
      for (const d of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
        if (d < 0 || d >= n || prev[d] !== -2) continue;
        prev[d] = k;
        const dx = d % w, dy = (d - dx) / w;
        if (!m[d] && !mine.has(d)) { exit = k; break; }
        if (m[d]) {
          if (dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1) { exit = d; break; }
          queue.push(d);
        }
      }
      if (exit >= 0) {
        for (let c = exit; c >= 0 && m[c]; c = prev[c]) m[c] = 0;
        break;
      }
    }
  }
  return m;
};

/** One pass of corner cutting (a quarter in from each end of every side), to the tenth of a foot. */
const smooth = (pts: P[]): P[] => {
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return out.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
};

/** A mask grown (or, with `shrink`, worn back) `r` cells all round, within a circle. */
const morph = (m: Uint8Array, w: number, h: number, r: number, to: 0 | 1) => {
  if (r < 1) return m;
  const out = m.slice(), offs: number[][] = [];
  for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (a * a + b * b <= r * r) offs.push([a, b]);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (m[j * w + i] === to) continue;
    // (a cell turns when anything within reach is already what it turns to; past the site's edge
    // nothing does: a wood running off it keeps its edge there)
    for (const [a, b] of offs) {
      const x = i + a, y = j + b;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const v = m[y * w + x];
      if (v === to) { out[j * w + i] = to; break; }
    }
  }
  return out;
};
const grow = (m: Uint8Array, w: number, h: number, r: number) => morph(m, w, h, r, 1);
const shrink = (m: Uint8Array, w: number, h: number, r: number) => morph(m, w, h, r, 0);

/** The ground kept out, on the grid: shapes filled, lines as wide as they are. */
const rasterize = (keepOut: { areas?: P[][]; lines?: { points: P[]; width: number }[] }, w: number, h: number, c2: number) => {
  const mask = new Uint8Array(w * h);
  for (const poly of keepOut.areas ?? []) {
    if (poly.length < 3) continue;
    const b = boundsOf(poly);
    for (let j = Math.max(0, Math.floor(b.minY / c2)); j <= Math.min(h - 1, Math.floor(b.maxY / c2)); j++) {
      const y = (j + 0.5) * c2, xs: number[] = [];
      for (let k = 0, l = poly.length - 1; k < poly.length; l = k++) {
        const p = poly[k], q = poly[l];
        if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
      }
      xs.sort((a, c) => a - c);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let i = Math.max(0, Math.ceil(xs[k] / c2 - 0.5)); i <= Math.min(w - 1, Math.floor(xs[k + 1] / c2 - 0.5)); i++) mask[j * w + i] = 1;
    }
  }
  for (const line of keepOut.lines ?? []) {
    const r = line.width / 2;
    for (let k = 0; k + 1 < line.points.length; k++) {
      const p = line.points[k], q = line.points[k + 1], len = Math.hypot(q.x - p.x, q.y - p.y);
      for (let s = 0; s <= len; s += c2 / 2) {
        const x = p.x + ((q.x - p.x) * s) / (len || 1), y = p.y + ((q.y - p.y) * s) / (len || 1);
        for (let j = Math.max(0, Math.floor((y - r) / c2)); j <= Math.min(h - 1, Math.floor((y + r) / c2)); j++)
          for (let i = Math.max(0, Math.floor((x - r) / c2)); i <= Math.min(w - 1, Math.floor((x + r) / c2)); i++)
            if (((i + 0.5) * c2 - x) ** 2 + ((j + 0.5) * c2 - y) ** 2 <= r * r) mask[j * w + i] = 1;
      }
    }
  }
  return mask;
};
