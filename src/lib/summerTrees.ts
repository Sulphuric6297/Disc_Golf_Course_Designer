// The trees a survey flown bare (in winter) couldn't pick out, from the summer photo: where the
// photo shows leaves and the survey measured something standing nearby (even bare limbs stand up
// a little), but no measured crown covers it. Each patch of it is filled with trees sized from the
// heights around them, the widest gaps first: a small patch on its own is one tree, a gap in a
// wood several. They are plain trees from then on, put after the measured ones (doc.lidar.fromPhoto
// says how many), so cutting, moving and bringing back work on them as on any.
import type { LidarTree, P } from "../types";

/** The grid the gaps are found on (ft a cell). */
const CELL = 2;
/** Measured as standing (ft over the ground) within this reach (ft): what a bare tree shows. */
const STANDING_FT = 6;
const NEAR_FT = 12;
/** The narrowest gap a tree is put in (ft across): narrower is the edge of a crown. */
const MIN_GAP_FT = 14;
/** A tree's crown reaches out this share of its height, between these (ft). */
const CROWN_SHARE = 0.4;
const CROWN_FT: [number, number] = [6, 30];
/** A tree with nothing measured near it this high (ft): a grown park tree. */
const LOW_FT = 12;
/** The most added. */
const MAX_ADDED = 8000;

/** Whether a survey's trees are filled out from the photo: the survey flown bare (or not known to
 * be in leaf) and the photo not taken bare. */
export const summerFills = (surveyLeafOn: boolean | null | undefined, photoSeason: string | undefined) => surveyLeafOn !== true && photoSeason !== "leaf-off";

/**
 * Trees for the summer canopy a bare survey missed. `m`: the survey's canopy heights (ft, `cell` ft
 * a cell, lidar's measureSite); `leaf`: the photo's tree canopy, a pixel each (`w` by `h` over the
 * site); `trees`: the measured ones; `keepOut`: where none may stand (roads, buildings, water).
 */
export const treesFromSummer = (
  trees: LidarTree[],
  m: { nx: number; ny: number; cell: number; canopy: Float32Array },
  leaf: { mask: Uint8Array; w: number; h: number },
  width: number,
  height: number,
  keepOut: (p: P) => boolean = () => false
): LidarTree[] => {
  const nx = Math.ceil(width / CELL), ny = Math.ceil(height / CELL), n = nx * ny;
  // The survey's heights on this grid (the highest in each cell)
  const tall = new Float32Array(n);
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
    const v = m.canopy[j * m.nx + i];
    if (!(v > 0)) continue;
    const x = Math.floor(((i + 0.5) * m.cell) / CELL), y = Math.floor(((j + 0.5) * m.cell) / CELL);
    if (x < nx && y < ny && v > tall[y * nx + x]) tall[y * nx + x] = v;
  }
  // (the highest within reach: a square, run along the rows and then the columns)
  const reach = Math.round(NEAR_FT / CELL);
  const near = maxNear(maxNear(tall, nx, ny, reach, 1), nx, ny, reach, nx);
  // Summer canopy: leaves on the photo, with something standing near
  const gap = new Uint8Array(n);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = y * nx + x;
    if (near[c] < STANDING_FT) continue;
    const px = Math.min(leaf.w - 1, Math.floor((((x + 0.5) * CELL) / width) * leaf.w)), py = Math.min(leaf.h - 1, Math.floor((((y + 0.5) * CELL) / height) * leaf.h));
    if (leaf.mask[py * leaf.w + px]) gap[c] = 1;
  }
  // ...less what the measured crowns cover already
  const cover = (x0: number, y0: number, r: number) => {
    const cx = x0 / CELL, cy = y0 / CELL, cr = r / CELL;
    for (let y = Math.max(0, Math.floor(cy - cr)); y <= Math.min(ny - 1, Math.ceil(cy + cr)); y++)
      for (let x = Math.max(0, Math.floor(cx - cr)); x <= Math.min(nx - 1, Math.ceil(cx + cr)); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= cr * cr) gap[y * nx + x] = 0;
  };
  for (const [x, y, , r] of trees) cover(x, y, r * 0.85);
  // How far each cell of the gaps is from their edge (cells)
  const d = distanceIn(gap, nx, ny);
  const order: number[] = [];
  const least = MIN_GAP_FT / 2 / CELL;
  for (let c = 0; c < n; c++) if (d[c] >= least) order.push(c);
  order.sort((a, b) => d[b] - d[a]);
  // The widest first: a tree as wide as the gap is there (and its height allows), clear of those
  // put in before it
  const added: LidarTree[] = [];
  const BIN = 64, bins = new Map<number, number[]>();
  const binOf = (x: number, y: number) => Math.floor(x / BIN) * 100003 + Math.floor(y / BIN);
  for (const c of order) {
    if (added.length >= MAX_ADDED) break;
    if (!gap[c]) continue;
    const x = ((c % nx) + 0.5) * CELL, y = (Math.floor(c / nx) + 0.5) * CELL;
    if (keepOut({ x, y })) continue;
    const h = Math.max(LOW_FT, near[c]);
    let r = Math.min(d[c] * CELL * 1.15, Math.min(CROWN_FT[1], Math.max(CROWN_FT[0], CROWN_SHARE * h)));
    for (let by = -1; by <= 1; by++) for (let bx = -1; bx <= 1; bx++)
      for (const k of bins.get(binOf(x + bx * BIN, y + by * BIN)) ?? []) {
        const t = added[k];
        r = Math.min(r, Math.hypot(t[0] - x, t[1] - y) - t[3] * 0.85);
      }
    if (r < MIN_GAP_FT / 2) continue;
    const key = binOf(x, y);
    bins.set(key, [...(bins.get(key) ?? []), added.length]);
    added.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(h * 10) / 10, Math.round(r * 10) / 10, 0]);
    cover(x, y, r * 0.85);
  }
  return added;
};

/** The highest within `r` cells along one way (`step` 1: rows, `nx`: columns). */
const maxNear = (v: Float32Array, nx: number, ny: number, r: number, step: number) => {
  const out = new Float32Array(v.length);
  const len = step === 1 ? nx : ny, lines = step === 1 ? ny : nx;
  for (let l = 0; l < lines; l++) {
    const start = step === 1 ? l * nx : l;
    for (let i = 0; i < len; i++) {
      let best = 0;
      for (let k = Math.max(0, i - r); k <= Math.min(len - 1, i + r); k++) { const u = v[start + k * step]; if (u > best) best = u; }
      out[start + i * step] = best;
    }
  }
  return out;
};

/** How far (cells, about) each cell that's set is from the nearest that isn't: two passes, the
 * straight steps 1 and the diagonal ones √2. */
const distanceIn = (on: Uint8Array, nx: number, ny: number) => {
  const d = new Float32Array(on.length);
  const BIG = 1e6, D = Math.SQRT2;
  for (let c = 0; c < on.length; c++) d[c] = on[c] ? BIG : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= nx || y >= ny ? 0 : d[y * nx + x]);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = y * nx + x;
    if (!d[c]) continue;
    d[c] = Math.min(d[c], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + D, at(x + 1, y - 1) + D);
  }
  for (let y = ny - 1; y >= 0; y--) for (let x = nx - 1; x >= 0; x--) {
    const c = y * nx + x;
    if (!d[c]) continue;
    d[c] = Math.min(d[c], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + D, at(x - 1, y + 1) + D);
  }
  return d;
};
