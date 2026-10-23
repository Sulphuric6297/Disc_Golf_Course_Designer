// Trees and ground measured from the air (USGS 3DEP LiDAR, kept on AWS as Entwine Point Tiles in
// web Mercator). Pure: which tiles cover a site, reading them, and turning their points into the
// ground's height and single trees (where each stands, how tall, how wide; a narrow crown taken for a conifer).
import type { CourseDoc, Hole, LidarTree, P } from "../types";
import { fairwayOutline } from "./course";
import { boundsOf, distanceToPolygon, pointInPolygon, smoothPath } from "./geom";
import { FEET_PER_METER } from "./geo/core";
import type { GeoRef } from "./geoRef";

const R = 6378137, DEG = Math.PI / 180;
/** Web Mercator meters from latitude and longitude, and back. */
export const mercX = (lon: number) => R * lon * DEG;
export const mercY = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
const lonOf = (x: number) => x / R / DEG;
const latOf = (y: number) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / DEG;

/** A survey's tiles: its bounds (a cube, meters), how many points across a tile, how stored. */
export type Ept = { bounds: number[]; span: number; dataType: string; srs?: { horizontal?: string } };
/** Site bounds in web Mercator meters: [minX, minY, maxX, maxY]. */
export type Box = [number, number, number, number];

export const siteBox = (ref: GeoRef, margin = 15): Box => [mercX(ref.west) - margin, mercY(ref.south) - margin, mercX(ref.east) + margin, mercY(ref.north) + margin];

/** How deep to read a survey: its tiles about a meter between points (finer adds much for little). */
export const depthFor = (ept: Ept, spacing = 1) => Math.max(0, Math.floor(Math.log2((ept.bounds[3] - ept.bounds[0]) / (ept.span * spacing))));

/** The tiles over a box, down to `maxDepth`, with how many points each holds (its hierarchy read
 * as needed: a count of -1 means more of it in its own file). */
export const tilesOver = async (ept: Ept, box: Box, maxDepth: number, hierarchy: (key: string) => Promise<Record<string, number>>) => {
  const [x0, y0, , x1] = ept.bounds, size = x1 - x0;
  const over = (key: string) => {
    const [d, x, y] = key.split("-").map(Number), s = size / 2 ** d;
    const ax = x0 + x * s, ay = y0 + y * s;
    return d <= maxDepth && ax < box[2] && ax + s > box[0] && ay < box[3] && ay + s > box[1];
  };
  const tiles: { key: string; points: number }[] = [];
  const walk = async (key: string) => {
    const h = await hierarchy(key);
    const more: string[] = [];
    for (const [k, n] of Object.entries(h)) {
      if (!over(k)) continue;
      if (n === -1) more.push(k);
      else if (n > 0) tiles.push({ key: k, points: n });
    }
    for (const k of more) await walk(k);
  };
  await walk("0-0-0-0");
  return tiles;
};

/** Points over a site: plan feet (x east, y south), height in feet, LAS class. */
export type LidarPoints = { x: number[]; y: number[]; z: number[]; cls: number[] };
export const emptyPoints = (): LidarPoints => ({ x: [], y: [], z: [], cls: [] });

/** What reads compressed LAS tiles (laz-perf). */
export type LazReader = {
  HEAPU8: Uint8Array;
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  LASZip: new () => { open: (p: number, n: number) => void; getPoint: (p: number) => void; getCount: () => number; getPointLength: () => number; delete: () => void };
};

/** One compressed tile's points that fall on the site, added to `out` in plan feet. */
export const readTile = (lp: LazReader, buf: Uint8Array, ref: GeoRef, box: Box, out: LidarPoints) => {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const fmt = buf[104] & 0x3f;
  const sx = dv.getFloat64(131, true), sy = dv.getFloat64(139, true), sz = dv.getFloat64(147, true);
  const ox = dv.getFloat64(155, true), oy = dv.getFloat64(163, true), oz = dv.getFloat64(171, true);
  const file = lp._malloc(buf.length);
  lp.HEAPU8.set(buf, file);
  const las = new lp.LASZip();
  try {
    las.open(file, buf.length);
    const len = las.getPointLength(), n = las.getCount(), pt = lp._malloc(len);
    const kx = ref.width / (ref.east - ref.west), ky = ref.height / (ref.north - ref.south);
    for (let k = 0; k < n; k++) {
      las.getPoint(pt);
      const p = new DataView(lp.HEAPU8.buffer, pt, len);
      const X = p.getInt32(0, true) * sx + ox, Y = p.getInt32(4, true) * sy + oy;
      if (X < box[0] || X > box[2] || Y < box[1] || Y > box[3]) continue;
      out.x.push((lonOf(X) - ref.west) * kx);
      out.y.push((ref.north - latOf(Y)) * ky);
      out.z.push((p.getInt32(8, true) * sz + oz) * FEET_PER_METER);
      // (the class: its own byte from format 6 on, the low 5 bits before)
      out.cls.push(fmt >= 6 ? p.getUint8(16) : p.getUint8(15) & 31);
    }
    lp._free(pt);
  } finally {
    las.delete();
    lp._free(file);
  }
};

/** The ground and the canopy over a site, `cell` ft a square: ground height (ft, the survey's
 * datum; filled in under buildings and water from around them) and how high what grows stands
 * over it (ft; power lines and other thin streaks left out). */
export const measureSite = (pts: LidarPoints, width: number, height: number, cell = 3) => {
  const nx = Math.max(1, Math.ceil(width / cell)), ny = Math.max(1, Math.ceil(height / cell)), n = nx * ny;
  const ground = new Float32Array(n).fill(Infinity), top = new Float32Array(n).fill(-Infinity);
  // (what grows: low, medium and high vegetation, or, in a survey that only told the ground apart,
  // everything else)
  const veg = pts.cls.some(c => c === 3 || c === 4 || c === 5) ? new Set([3, 4, 5]) : new Set([1]);
  for (let k = 0; k < pts.x.length; k++) {
    const i = Math.floor(pts.x[k] / cell), j = Math.floor(pts.y[k] / cell);
    if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
    const c = j * nx + i, cls = pts.cls[k], z = pts.z[k];
    if (cls === 2) ground[c] = Math.min(ground[c], z);
    else if (veg.has(cls)) top[c] = Math.max(top[c], z);
  }
  fillGaps(ground, nx, ny);
  const canopy = new Float32Array(n);
  for (let c = 0; c < n; c++) canopy[c] = Number.isFinite(top[c]) && Number.isFinite(ground[c]) ? Math.min(200, Math.max(0, top[c] - ground[c])) : 0;
  // (only where a 3 x 3 block of it stands: a wire or a fence line is one or two cells wide)
  const on = (c: number) => canopy[c] > 8;
  const core = new Uint8Array(n);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    let all = 1;
    for (let dj = -1; dj <= 1 && all; dj++) for (let di = -1; di <= 1 && all; di++) if (!on((j + dj) * nx + i + di)) all = 0;
    core[j * nx + i] = all;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let near = 0;
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1 && !near; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < nx && b < ny && core[b * nx + a]) near = 1;
    }
    if (!near) canopy[j * nx + i] = 0;
  }
  return { nx, ny, cell, ground, canopy };
};

/** Cells with no value (Infinity) filled from their neighbors, nearest first. */
const fillGaps = (v: Float32Array, nx: number, ny: number) => {
  let front: number[] = [];
  for (let c = 0; c < v.length; c++) if (!Number.isFinite(v[c])) front.push(c);
  if (front.length === v.length) return v.fill(0);
  while (front.length) {
    const next: number[] = [], set: [number, number][] = [];
    for (const c of front) {
      const i = c % nx, j = (c - i) / nx;
      let s = 0, k = 0;
      for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1], [i - 1, j - 1], [i + 1, j + 1], [i - 1, j + 1], [i + 1, j - 1]]) {
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const w = v[b * nx + a];
        if (Number.isFinite(w)) { s += w; k++; }
      }
      if (k) set.push([c, s / k]);
      else next.push(c);
    }
    for (const [c, w] of set) v[c] = w;
    if (!set.length) break;
    front = next;
  }
  return v;
};

/** Single trees in the canopy: each top (the highest point within a reach that grows with its
 * height, at least 15 ft up), how far its crown spreads, and a guess at its kind (narrow: a conifer). */
export const findTrees = (m: { nx: number; ny: number; cell: number; canopy: Float32Array }): LidarTree[] => {
  const { nx, ny, cell, canopy } = m;
  // (smoothed a little: one leafy bump isn't a tree)
  const s = blur3(canopy, nx, ny);
  const tops: [number, number, number][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const h = s[j * nx + i];
    if (h <= 15) continue;
    const rr = Math.max(2, Math.round((0.06 * h + 4) / cell));
    let top = true;
    for (let b = Math.max(0, j - rr); b <= Math.min(ny - 1, j + rr) && top; b++) for (let a = Math.max(0, i - rr); a <= Math.min(nx - 1, i + rr); a++) {
      if (s[b * nx + a] > h + 1e-6) { top = false; break; }
    }
    if (top) tops.push([i, j, canopy[j * nx + i]]);
  }
  tops.sort((a, b) => b[2] - a[2]);
  const taken = new Set<number>(), trees: LidarTree[] = [];
  for (const [i, j, h] of tops) {
    // (one top to a flat crown)
    let dup = false;
    for (let b = j - 1; b <= j + 1 && !dup; b++) for (let a = i - 1; a <= i + 1; a++) if (taken.has(b * nx + a)) { dup = true; break; }
    if (dup) continue;
    taken.add(j * nx + i);
    // Its crown: how far out (eight ways) the canopy stays over 60% of its top, still falling away
    const reach: number[] = [];
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4;
      let d = 0, last = h;
      for (let step = 1; step < 25; step++) {
        const a = Math.round(i + Math.cos(ang) * step), b = Math.round(j + Math.sin(ang) * step);
        if (a < 0 || b < 0 || a >= nx || b >= ny) break;
        const v = s[b * nx + a];
        if (v < 0.6 * h || v > last + 2) break;
        d = step;
        last = v;
      }
      reach.push(d);
    }
    reach.sort((a, b) => a - b);
    const r = Math.min(Math.max(4, ((reach[3] + reach[4]) / 2) * cell + cell / 2), 0.45 * h + 4);
    const round1 = (v: number) => Math.round(v * 10) / 10;
    trees.push([round1((i + 0.5) * cell), round1((j + 0.5) * cell), round1(h), round1(r), r / h < 0.16 ? 1 : 0]);
  }
  return trees;
};

const blur3 = (v: Float32Array, nx: number, ny: number) => {
  const a = new Float32Array(v.length), b = new Float32Array(v.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let s = 0, k = 0;
    for (let d = -1; d <= 1; d++) { const x = Math.min(nx - 1, Math.max(0, i + d)); s += v[j * nx + x]; k++; }
    a[j * nx + i] = s / k;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let s = 0, k = 0;
    for (let d = -1; d <= 1; d++) { const y = Math.min(ny - 1, Math.max(0, j + d)); s += a[y * nx + i]; k++; }
    b[j * nx + i] = s / k;
  }
  return b;
};

/** The ground measured, on the plan's terrain grid: heights (ft over its lowest point), its lowest
 * and highest (ft, the survey's datum). */
export const groundOnGrid = (m: { nx: number; ny: number; cell: number; ground: Float32Array }, width: number, height: number, grid: number) => {
  const at = (x: number, y: number) => {
    // (the mean of the cells round the grid point)
    const i = Math.floor(x / m.cell), j = Math.floor(y / m.cell);
    let s = 0, k = 0;
    for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) {
      if (a < 0 || b < 0 || a >= m.nx || b >= m.ny) continue;
      s += m.ground[b * m.nx + a];
      k++;
    }
    return k ? s / k : 0;
  };
  const raw: [string, number][] = [];
  let lo = Infinity, hi = -Infinity;
  for (let x = 0; x <= width + 1e-6; x += grid) for (let y = 0; y <= height + 1e-6; y += grid) {
    const v = at(x, y);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
    raw.push([`${Math.round(x)},${Math.round(y)}`, v]);
  }
  const heights: Record<string, number> = {};
  for (const [k, v] of raw) if (Math.abs(v - lo) > 0.001) heights[k] = Math.round((v - lo) * 100) / 100;
  return { heights, min: lo, max: hi };
};

/** A survey's year, from its name (the latest four-figure year in it). */
/** A measured tree grown `years` years: each year it grows less the nearer it is to a tree's full
 * height (small trees fastest, about 2 to 2½ ft a year; tall ones hardly), its crown widening
 * with it. Conifers grow a little slower, and taller. */
export const grownTree = (t: LidarTree, years: number, young = false): LidarTree => {
  const [x, y, h0, r0, conifer] = t;
  // (a sapling shoots up faster and stays narrow: a crown fills out later)
  const full = conifer ? 120 : 100, fast = (conifer ? 2.2 : 2.6) * (young ? 1.4 : 1), widen = young ? 0.55 : 0.8;
  let h = h0, r = r0;
  for (let i = 0; i < Math.round(years); i++) {
    const h2 = h + fast * Math.max(0, 1 - h / full) ** 1.5;
    r *= (h2 / Math.max(1, h)) ** widen;
    h = h2;
  }
  return [x, y, Math.round(h * 10) / 10, Math.round(r * 10) / 10, conifer];
};

/** A number in [0, 1) from a tree's index and a salt: the same every time, so saplings stand
 * where they stood (no library, no state). */
const spread = (k: number, salt: number) => {
  let n = (k + 1) * 2654435761 + salt * 40503;
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** The trees the survey couldn't see that would stand `years` later: saplings that came up in
 * the open gaps of a wood and at its edges (where the light gets in), one for a share of the
 * measured trees rising with the years, each born some year since and grown from a 2 ft shoot,
 * fast and narrow. Never under or against a crown: each stands clear of every measured tree's
 * crown (as it will have grown) by 3 ft, and 8 ft from another sapling; where a tree has no such
 * gap near it, none comes up. Only those tall enough to count (6 ft) are returned. */
export const saplings = (trees: LidarTree[], years: number): LidarTree[] => {
  const out: LidarTree[] = [];
  if (years < 2) return out;
  const share = Math.min(0.45, years * 0.03);
  // (the measured trees by 40 ft cell, with their crowns as they will have grown)
  const CELL = 40, cells = new Map<string, LidarTree[]>();
  const grownAll = trees.map(t => grownTree(t, years));
  for (const t of grownAll) {
    const key = `${Math.floor(t[0] / CELL)},${Math.floor(t[1] / CELL)}`;
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(t);
  }
  const placed: P[] = [];
  const clear = (x: number, y: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let i = cx - 2; i <= cx + 2; i++) for (let j = cy - 2; j <= cy + 2; j++) {
      for (const t of cells.get(`${i},${j}`) ?? []) if (Math.hypot(t[0] - x, t[1] - y) < t[3] + 3) return false;
    }
    return !placed.some(q => Math.hypot(q.x - x, q.y - y) < 8);
  };
  trees.forEach((t, k) => {
    if (spread(k, 1) >= share) return;
    const [x, y, , , conifer] = t;
    const r = grownAll[k][3];
    // (a few spots round the tree, just past its crown and further out; the first clear one)
    for (let n = 0; n < 6; n++) {
      const a = spread(k, 2 + n * 3) * Math.PI * 2, d = r + 4 + spread(k, 3 + n * 3) * (r + 14);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (!clear(px, py)) continue;
      const born = spread(k, 4) * (years - 1);
      const g = grownTree([px, py, 2, 0.8, conifer], years - born, true);
      if (g[2] >= 6) {
        out.push([Math.round(g[0] * 10) / 10, Math.round(g[1] * 10) / 10, g[2], g[3], conifer]);
        placed.push({ x: px, y: py });
      }
      break;
    }
  });
  return out;
};

const grown = new WeakMap<LidarTree[], { years: number; out: LidarTree[] }>();
/** The course's measured trees, grown as many years as it asks (the same list when none), with
 * the saplings that came up since after them (so the measured trees keep their places in the
 * list: what was cut down or kept by index stays so). */
export const grownTrees = (lidar: NonNullable<CourseDoc["lidar"]>) => {
  const years = lidar.growYears ?? 0;
  if (!years) return lidar.trees;
  const hit = grown.get(lidar.trees);
  if (hit?.years === years) return hit.out;
  const out = [...lidar.trees.map(t => grownTree(t, years)), ...saplings(lidar.trees, years)];
  grown.set(lidar.trees, { years, out });
  return out;
};

/** Years since a survey (by the year in its name), or 0. */
export const yearsSince = (name: string) => { const y = surveyYear(name); return y ? Math.max(0, new Date().getFullYear() - y) : 0; };

/** A survey's year from its name: "…_2019", or USGS's newer work codes ("KY_Western_1_A22": 2022). */
export const surveyYear = (name: string) =>
  Math.max(0, ...(name.match(/(19|20)\d\d/g) ?? []).map(Number), ...[...name.matchAll(/(?:^|_)[A-Z](\d\d)(?=_|$)/g)].map(m => 2000 + Number(m[1])));

/** Which measured trees stand: those on a fairway, a tee or a basket's circle (as
 * `cleared` says) are cut down unless kept; any taken out are gone. */
export const standingTrees = (lidar: NonNullable<CourseDoc["lidar"]>, cleared: (p: P, reach: number) => boolean, nowhere: (p: P) => boolean = () => false) => {
  const kept = new Set(lidar.kept ?? []), removed = new Set(lidar.removed ?? []);
  // (a course can keep its measured trees on the fairways and cut by hand only)
  if (lidar.clearFairways === false) cleared = () => false;
  const stand: number[] = [], cut: number[] = [];
  lidar.trees.forEach((t, k) => {
    const p = { x: t[0], y: t[1] };
    if (removed.has(k)) cut.push(k);
    // (cleared for play, or where no tree stands: in water, on a road or path, a building or
    // parking; a tree found there is a bridge, a car, a wire or noise in the survey)
    // (and those smaller than the course wants: bushes, noise)
    else if (!kept.has(k) && (cleared(p, t[3] * 0.3) || nowhere(p) || t[2] < (lidar.minHeight ?? 0))) cut.push(k);
    else stand.push(k);
  });
  return { stand, cut };
};

/** The measured trees on a hole's fairway (its line as played): those cut down (cleared for play,
 * or taken out) and those kept standing. */
export const fairwayTrees = (doc: Pick<CourseDoc, "lidar">, hole: Hole, line: P[]) => {
  const out = { cut: [] as number[], kept: [] as number[] };
  const lidar = doc.lidar;
  if (!lidar?.trees.length || line.length < 2 || lidar.clearFairways === false) return out;
  const poly = fairwayOutline(hole, smoothPath(line, 8), hole.fairway ? 0 : -hole.fairwayWidth * 0.4, 6);
  const box = boundsOf(poly), kept = new Set(lidar.kept ?? []);
  lidar.trees.forEach(([x, y, , r], k) => {
    const reach = r * 0.3;
    if (x < box.minX - reach || x > box.maxX + reach || y < box.minY - reach || y > box.maxY + reach) return;
    if (!pointInPolygon({ x, y }, poly) && distanceToPolygon({ x, y }, poly) >= reach) return;
    (kept.has(k) ? out.kept : out.cut).push(k);
  });
  return out;
};
