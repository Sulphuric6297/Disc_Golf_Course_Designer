// Parking lots no map has, found on the photo and the aerial survey together: on the photo,
// pavement (grey, not green, not a painted court); in the survey, flat at ground level (no roof,
// no tree over it, nothing taller than a truck on it). A grey roof looks the same as a parking lot
// from above, so without a survey there's no telling them apart, and none are looked for.
import { createArea } from "../course";
import { polygonArea, simplify } from "../geom";
import type { Measured } from "../lidar";
import { boxOutline, orientedBox } from "../structures";
import { createField } from "../fields";
import type { AreaItem, CourseItem, LineItem, P } from "../../types";
import { components, open, traceOutline } from "./detect";

/** Each cell of the grid looked over, ft. */
const CELL = 3;

/** A shape's cells cleared from the mask, a row at a time: where each row's middle crosses the
 * shape's edges, the cells between each pair (a lake's outline of many thousands of points is one
 * pass over its edges a row, not a test of every point for every cell). */
const unfill = (mask: Uint8Array, gw: number, gh: number, pts: P[]) => {
  const n = pts.length;
  if (n < 3) return;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const xs: number[] = [];
  for (let j = Math.max(0, Math.floor(y0 / CELL)); j <= Math.min(gh - 1, Math.ceil(y1 / CELL)); j++) {
    const y = (j + 0.5) * CELL;
    xs.length = 0;
    for (let k = 0, m = n - 1; k < n; m = k++) {
      const a = pts[m], b = pts[k];
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5)), i1 = Math.min(gw - 1, Math.floor(xs[k + 1] / CELL - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * gw + i] = 0;
    }
  }
};

/** The parking lots on a photo of a site `width` by `height` ft, where the survey measured it
 * (`m`), leaving out what the maps have already (`mapped`: its roads, buildings and areas). In
 * patches big enough for about ten cars, once strips under 12 ft across (sidewalks, driveways)
 * are trimmed off, and filling at least half the box round them. */
export const parkingFromPhoto = async (photoUrl: string, width: number, height: number, m: Pick<Measured, "nx" | "ny" | "cell" | "ground" | "canopy" | "roofs" | "surface" | "snx" | "sny">, mapped: CourseItem[]): Promise<AreaItem[]> => {
  const gw = Math.ceil(width / CELL), gh = Math.ceil(height / CELL), n = gw * gh;
  const img = new Image();
  img.src = photoUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = gw; c.height = gh;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, gw, gh);
  const px = g.getImageData(0, 0, gw, gh).data;
  const mask = new Uint8Array(n);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i, r = px[k * 4], gg = px[k * 4 + 1], b = px[k * 4 + 2];
    const hi = Math.max(r, gg, b), lo = Math.min(r, gg, b), v = (r + gg + b) / 3;
    // (pavement: grey, from fresh asphalt to old concrete; grass and leaves are green)
    if (hi - lo > 28 || v < 40 || v > 190 || (gg > r + 10 && gg > b + 6)) continue;
    // (at ground level by the survey: no tree over it, no roof, nothing taller than a truck)
    const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL;
    const li = Math.min(m.nx - 1, Math.floor(x / m.cell)), lj = Math.min(m.ny - 1, Math.floor(y / m.cell)), lc = lj * m.nx + li;
    if (m.canopy[lc] > 0 || m.roofs[lc]) continue;
    const top = m.surface[Math.min(m.sny - 1, lj >> 1) * m.snx + Math.min(m.snx - 1, li >> 1)];
    if (Number.isFinite(top) && top - m.ground[lc] > 9) continue;
    mask[k] = 1;
  }
  // What the maps have already: roads (with a margin), buildings, water, fields, parking
  const clear = (x: number, y: number) => { const i = Math.floor(x / CELL), j = Math.floor(y / CELL); if (i >= 0 && j >= 0 && i < gw && j < gh) mask[j * gw + i] = 0; };
  for (const it of mapped) {
    if (it.type === "line" && (it.kind === "road" || it.kind === "path" || it.kind === "walk")) {
      const half = ((it as LineItem).width ?? (it.kind === "road" ? 24 : 6)) / 2 + 4;
      for (let s = 1; s < it.points.length; s++) {
        const a = it.points[s - 1], b = it.points[s], len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let t = 0; t <= len; t += CELL / 2) {
          const cx = a.x + ((b.x - a.x) * t) / Math.max(len, 1e-6), cy = a.y + ((b.y - a.y) * t) / Math.max(len, 1e-6);
          for (let dy = -half; dy <= half; dy += CELL / 2) for (let dx = -half; dx <= half; dx += CELL / 2) if (dx * dx + dy * dy <= half * half) clear(cx + dx, cy + dy);
        }
      }
    } else if ((it.type === "structure" && it.points.length > 2) || (it.type === "area" && (it.kind === "water" || it.kind === "field" || it.kind === "parking" || it.kind === "building"))) {
      unfill(mask, gw, gh, it.points);
    }
  }
  // (strips under 12 ft across trimmed off: a sidewalk, a driveway, the edge of a road)
  const solid = open(mask, gw, gh, 2);
  const out: AreaItem[] = [];
  for (const comp of components(solid, gw, gh, Math.ceil(2400 / (CELL * CELL)))) {
    const ring = traceOutline(gw, gh, comp).map(q => ({ x: q.x * CELL, y: q.y * CELL }));
    const pts: P[] = simplify(ring, CELL * 1.5);
    if (pts.length < 4) continue;
    const box = orientedBox(pts);
    if (polygonArea(pts) < box.a * box.b * 4 * 0.5) continue;
    out.push({ ...createArea("parking", pts), importSource: "photo" });
  }
  return out;
};

/**
 * Tennis and pickleball courts on the photo: blue painted rectangles the size of a court (78 × 36
 * ft, or pickleball's 44 × 20), lying at ground level by the survey. Each comes in with its
 * run-off round it (120 × 60 ft, 60 × 30), courts side by side as one field of them all.
 */
export const courtsFromPhoto = async (photoUrl: string, width: number, height: number, m: Pick<Measured, "nx" | "ny" | "cell" | "ground" | "canopy" | "roofs" | "surface" | "snx" | "sny">, mapped: CourseItem[]): Promise<AreaItem[]> => {
  const C = 2, gw = Math.ceil(width / C), gh = Math.ceil(height / C);
  const img = new Image();
  img.src = photoUrl;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = gw; cv.height = gh;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, gw, gh);
  const px = g.getImageData(0, 0, gw, gh).data;
  const mask = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i, r = px[k * 4], gg = px[k * 4 + 1], b = px[k * 4 + 2], v = (r + gg + b) / 3;
    // (a court's blue or a pool's: well bluer than it's red, as blue as it's green or more)
    if (b < r + 25 || b < gg - 4 || v < 45 || v > 230) continue;
    const x = (i + 0.5) * C, y = (j + 0.5) * C;
    const li = Math.min(m.nx - 1, Math.floor(x / m.cell)), lj = Math.min(m.ny - 1, Math.floor(y / m.cell)), lc = lj * m.nx + li;
    if (m.canopy[lc] > 0 || m.roofs[lc]) continue;
    mask[k] = 1;
  }
  type Box = { c: P; u: P; a: number; b: number; pickle: boolean };
  const found: Box[] = [];
  const pools: AreaItem[] = [];
  for (const comp of components(open(mask, gw, gh, 1), gw, gh, Math.ceil(250 / (C * C)))) {
    const ring = traceOutline(gw, gh, comp).map(q => ({ x: q.x * C, y: q.y * C }));
    if (ring.length < 4) continue;
    const box = orientedBox(ring), long = box.a * 2, wide = box.b * 2;
    // A pool: its water lighter and greener than a court's paint (cyan, not navy), any shape
    let sr = 0, sg = 0, sb = 0;
    for (const k of comp) { sr += px[k * 4]; sg += px[k * 4 + 1]; sb += px[k * 4 + 2]; }
    const N = comp.length, mr = sr / N, mg = sg / N, mb = sb / N;
    if (mg > mr + 25 && mg > mb - 30 && (mg + mb) / 2 > 110) {
      const area = comp.length * C * C;
      if (area >= 250 && area <= 12000) pools.push({ ...createField("pool", simplify(ring, C)), importSource: "photo" });
      continue;
    }
    if (polygonArea(ring) < long * wide * 0.7) continue;
    const tennis = long > 60 && long < 95 && wide > 26 && wide < 46, pickle = long > 34 && long < 56 && wide > 15 && wide < 28;
    if (!tennis && !pickle) continue;
    found.push({ c: box.c, u: box.u, a: pickle ? 30 : 60, b: pickle ? 15 : 30, pickle });
  }
  // Courts side by side: one field (lined up, their run-off touching)
  const groups: Box[][] = [];
  for (const f of found) {
    const near = groups.find(gr => gr[0].pickle === f.pickle && Math.abs(gr[0].u.x * f.u.x + gr[0].u.y * f.u.y) > 0.95 && gr.some(o => Math.hypot(o.c.x - f.c.x, o.c.y - f.c.y) < (o.b + f.b) * 1.25));
    if (near) near.push(f); else groups.push([f]);
  }
  // (a pool where a field is mapped already is that field's; one in mapped water is sorted out by the import)
  const out: AreaItem[] = pools.filter(pl => !mapped.some(i => i.type === "area" && i.kind === "field" && insidePoly(pl.points[0], i.points)));
  for (const gr of groups) {
    const corners = gr.flatMap(f => { const v = { x: -f.u.y, y: f.u.x }; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => ({ x: f.c.x + f.u.x * f.a * s + v.x * f.b * t, y: f.c.y + f.u.y * f.a * s + v.y * f.b * t })); });
    const outline = boxOutline(corners);
    const mid = { x: outline.reduce((s, p) => s + p.x, 0) / 4, y: outline.reduce((s, p) => s + p.y, 0) / 4 };
    // (not where a field is mapped already)
    if (mapped.some(i => i.type === "area" && i.kind === "field" && insidePoly(mid, i.points))) continue;
    out.push({ ...createField(gr[0].pickle ? "pickleball" : "tennis", outline), importSource: "photo" });
  }
  return out;
};

const insidePoly = (p: P, pts: P[]) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};
