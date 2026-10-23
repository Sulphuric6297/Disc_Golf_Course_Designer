// Finds trees and parked vehicles in an aerial photo, so they can be suggested on import.
// Pure functions over RGBA pixels; callers convert pixels to map coordinates.

export type DetectImage = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
export type DetectedTree = { x: number; y: number; radiusPx: number };
export type DetectedVehicle = { x: number; y: number; lengthPx: number; widthPx: number; angleDeg: number };

type Opts = {
  metersPerPx: number;
  /** Pixels to ignore (e.g. inside building footprints). */
  exclude?: (x: number, y: number) => boolean;
};

/** Box mean and standard deviation of a channel over a (2r+1)^2 window, via integral images. */
const localStats = (v: Float32Array, w: number, h: number, r: number) => {
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const sq = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < w; x++) {
      const a = v[y * w + x];
      rs += a;
      rq += a * a;
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs;
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rq;
    }
  }
  const mean = new Float32Array(w * h);
  const std = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const n = (y1 - y0) * (x1 - x0);
      const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      const q = sq[y1 * W + x1] - sq[y0 * W + x1] - sq[y1 * W + x0] + sq[y0 * W + x0];
      const m = s / n;
      mean[y * w + x] = m;
      std[y * w + x] = Math.sqrt(Math.max(0, q / n - m * m));
    }
  }
  return { mean, std };
};

/** Connected components (4-neighbour) of a mask; returns pixel index lists. */
const components = (mask: Uint8Array, w: number, h: number, minSize: number) => {
  const seen = new Uint8Array(w * h);
  const out: number[][] = [];
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const comp: number[] = [];
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const x = k % w;
      const y = (k - x) / w;
      if (x > 0 && mask[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
      if (x < w - 1 && mask[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
      if (y > 0 && mask[k - w] && !seen[k - w]) { seen[k - w] = 1; stack.push(k - w); }
      if (y < h - 1 && mask[k + w] && !seen[k + w]) { seen[k + w] = 1; stack.push(k + w); }
    }
    if (comp.length >= minSize) out.push(comp);
  }
  return out;
};

/** Square-window morphology via an integral image: O(pixels) for any radius. */
const morph = (mask: Uint8Array, w: number, h: number, r: number, op: "grow" | "shrink"): Uint8Array => {
  if (r <= 0) return mask;
  const W = w + 1;
  const sum = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const n = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      out[y * w + x] = op === "grow" ? (n > 0 ? 1 : 0) : (n === (y1 - y0) * (x1 - x0) ? 1 : 0);
    }
  }
  return out;
};
/** Fill small gaps (grow, then shrink). */
const close = (m: Uint8Array, w: number, h: number, r: number) => morph(morph(m, w, h, r, "grow"), w, h, r, "shrink");
/** Remove thin bits (shrink, then grow). */
const open = (m: Uint8Array, w: number, h: number, r: number) => morph(morph(m, w, h, r, "shrink"), w, h, r, "grow");

/** Distance (pixels) from each set pixel to the nearest unset one (chamfer 3-4, ~exact to 8%). */
const distanceTransform = (mask: Uint8Array, w: number, h: number) => {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3); else v = Math.min(v, 3);
    if (y > 0) {
      v = Math.min(v, d[i - w] + 3);
      if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
    } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 3); else v = Math.min(v, 3);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + 3);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
      if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
    } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
};

// How much a sunlit crown top counts next to depth inside the canopy (tuned on labelled NEON aerial
// photos: about 55% of crowns found in dense forest, where crowns touch).
const TREE_LIT = 3;
// Texture thresholds (also tuned on those photos): fine-texture scale, how busy dark canopy must
// be, and the gradient coherence above which a busy patch is an edge, not leaves.
const TEX_SCALE = 6;
const DARK_TEX = 0.22;
const EDGE_MAX = 0.8;
/** Box blur of a float image over a (2r+1)^2 window. */
const blur = (v: Float32Array, w: number, h: number, r: number) => localStats(v, w, h, r).mean;

/**
 * Tree canopies, one detection per crown. Vegetation that is darker or more textured than the
 * lawn around it is canopy (leaves shade each other; grass is smooth and bright); touching crowns
 * are split at the "necks" between them, using each pixel's distance to the canopy's edge.
 */
/**
 * Where the photo shows tree canopy (1) rather than lawn, shadow or anything else (0): vegetation
 * that is darker or more textured than the lawn. Null when there is too little vegetation to tell.
 */
export const canopyMask = (img: DetectImage, opts: Opts) => {
  const { width: w, height: h, data } = img;
  const mpp = opts.metersPerPx;
  const n = w * h;
  const luma = new Float32Array(n);
  const veg = new Uint8Array(n);
  let vegCount = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const sum = r + g + b + 1;
    const exg = (2 * g - r - b) / sum;
    // Green: leaves and grass, from sunlit yellow-green to dark blue-green conifers.
    if (exg > 0.035 && g >= r * 0.92 && g > b * 0.95 && luma[i] < 235 && !(opts.exclude && opts.exclude(i % w, (i / w) | 0))) {
      veg[i] = 1;
      vegCount++;
    }
  }
  if (vegCount < 60) return null;
  // Brightness over about half a meter, and fine texture: how much each pixel differs from its
  // immediate neighbours, averaged over that area (leaves flicker everywhere; a shadow's edge is
  // one line, so it hardly counts).
  const win = Math.max(1, Math.round(0.5 / mpp));
  const { mean } = localStats(luma, w, h, win);
  // Clumps of leaves (a few pixels across), not single-pixel noise: smooth a little first, then
  // take how much each pixel differs from its surroundings, averaged over the window.
  const soft = localStats(luma, w, h, 1).mean;
  const around = localStats(soft, w, h, Math.max(2, Math.round(0.6 / mpp))).mean;
  const hp = new Float32Array(n);
  for (let i = 0; i < n; i++) hp[i] = Math.abs(soft[i] - around[i]);
  const fine = localStats(hp, w, h, win).mean;
  const std = fine.map(v => v * TEX_SCALE);
  // Edge or texture? Along a shadow's edge every brightness change points the same way; among
  // leaves they point every which way (gradient coherence, from the structure tensor).
  const gxx = new Float32Array(n), gyy = new Float32Array(n), gxy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = soft[i + 1] - soft[i - 1], gy = soft[i + w] - soft[i - w];
    gxx[i] = gx * gx; gyy[i] = gy * gy; gxy[i] = gx * gy;
  }
  const jxx = localStats(gxx, w, h, win).mean, jyy = localStats(gyy, w, h, win).mean, jxy = localStats(gxy, w, h, win).mean;
  const coherence = (i: number) => {
    const t = jxx[i] + jyy[i];
    return t > 1e-6 ? Math.sqrt((jxx[i] - jyy[i]) ** 2 + 4 * jxy[i] * jxy[i]) / t : 0;
  };
  // The lawn: the bright, smooth end of the vegetation.
  const brightSmooth: number[] = [];
  for (let i = 0; i < n; i += 3) if (veg[i] && std[i] / Math.max(mean[i], 1) < 0.12) brightSmooth.push(mean[i]);
  const all: number[] = [];
  for (let i = 0; i < n; i += 3) if (veg[i]) all.push(mean[i]);
  const pick = (a: number[], q: number) => (a.sort((x, y) => x - y), a[Math.min(a.length - 1, Math.floor(a.length * q))]);
  const lawn = brightSmooth.length > 50 ? pick(brightSmooth, 0.6) : pick(all, 0.85);
  // Shadows on the lawn: dark but smooth. Their edges look busy (a sharp step from shade to sun),
  // so nothing next to a shadow counts as canopy just for being busy.
  const shade = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (mean[i] < lawn * 0.75 && std[i] / Math.max(mean[i], 1) < DARK_TEX * 0.5) shade[i] = 1;
  // (The busy band reaches as far as the texture windows do.)
  const nearShade = morph(shade, w, h, 2 * (Math.max(2, Math.round(0.6 / mpp)) + win) + 1, "grow");
  let mask: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!veg[i]) continue;
    // Leaves are lumpy: a shadow on the lawn is as dark, but smooth.
    const cov = std[i] / Math.max(mean[i], 1);
    const dark = mean[i] < lawn * 0.8 && cov > DARK_TEX && coherence(i) < EDGE_MAX;
    const rough = cov > 0.16 && mean[i] < lawn * 0.92 && !nearShade[i] && coherence(i) < EDGE_MAX;
    if (dark || rough) mask[i] = 1;
  }
  // Clean up: drop specks and thin strips, fill the gaps between leaf clumps.
  const r1 = Math.max(1, Math.round(0.45 / mpp));
  mask = close(mask, w, h, r1);
  mask = open(mask, w, h, r1);
  // Fill small holes inside crowns (gaps in the leaves), so each crown is one solid shape.
  {
    const inv = new Uint8Array(n);
    for (let i = 0; i < n; i++) inv[i] = mask[i] ? 0 : 1;
    const maxHole = Math.PI * (1.5 / mpp) ** 2;
    for (const hole of components(inv, w, h, 1)) {
      if (hole.length > maxHole) continue;
      if (hole.some(k => { const x = k % w, y = (k / w) | 0; return x === 0 || y === 0 || x === w - 1 || y === h - 1; })) continue;
      for (const k of hole) mask[k] = 1;
    }
  }
  return { mask, luma, lawn, win, mpp, w, h, n };
};

export type Canopy = NonNullable<ReturnType<typeof canopyMask>>;

/** A shape found on a photo: its outline (pixels, clockwise) and how many pixels it covers. */
export type Region = { outline: { x: number; y: number }[]; areaPx: number };

// The 8 neighbours, clockwise on the screen (y down): W, NW, N, NE, E, SE, S, SW
const NX = [-1, -1, 0, 1, 1, 1, 0, -1];
const NY = [0, -1, -1, -1, 0, 1, 1, 1];

/** The outer edge of one connected shape (pixel centers, clockwise), by walking around it. */
export const traceOutline = (w: number, h: number, comp: number[]): { x: number; y: number }[] => {
  const inside = new Uint8Array(w * h);
  let start = Infinity;
  for (const k of comp) {
    inside[k] = 1;
    if (k < start) start = k;
  }
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x] === 1;
  const sx = start % w, sy = (start - sx) / w;
  const out: { x: number; y: number }[] = [];
  // (the first pixel in reading order: the one to its left is outside)
  let x = sx, y = sy, back = 0, first = -1;
  for (let step = 0; step < comp.length * 4 + 16; step++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      if (at(x + NX[d], y + NY[d])) { found = d; break; }
    }
    if (found < 0) { out.push({ x: x + 0.5, y: y + 0.5 }); break; }
    const nx = x + NX[found], ny = y + NY[found];
    if (x === sx && y === sy) {
      // Round once: leaving the start the same way again
      if (first === ny * w + nx) break;
      if (first < 0) first = ny * w + nx;
    }
    out.push({ x: x + 0.5, y: y + 0.5 });
    // The outside pixel looked at just before, seen from the next one
    const prev = (found + 7) % 8;
    const bx = x + NX[prev] - nx, by = y + NY[prev] - ny;
    x = nx;
    y = ny;
    back = NX.findIndex((v, i) => v === bx && NY[i] === by);
    if (back < 0) back = 0;
  }
  return out;
};

/** Stands of trees: canopy patches (crowns a few meters apart joined) of at least `minAreaM2`. */
export const woodsRegions = (canopy: Canopy, minAreaM2 = 400): Region[] => {
  const { mask, mpp, w, h } = canopy;
  let m = close(mask, w, h, Math.max(1, Math.round(2.5 / mpp)));
  // (the rim of the crowns that the canopy mask leaves out)
  m = morph(m, w, h, Math.max(1, Math.round(0.6 / mpp)), "grow");
  return components(m, w, h, Math.ceil(minAreaM2 / (mpp * mpp))).map(c => ({ outline: traceOutline(w, h, c), areaPx: c.length }));
};

/** Stands of trees measured from the air: their crowns (plan ft) joined wherever they come within
 * `gapFt` of each other, each stand of at least `minTrees` trees traced around its crowns (in
 * cells of `cell` ft, so a stand's outline is in cells: times `cell` for plan ft). Trees farther
 * apart than the gap, across a fairway, a road or a clearing, fall in stands of their own. */
export const treeStands = (trees: { x: number; y: number; r: number }[], width: number, height: number, gapFt = 14, minTrees = 6, cell = 4) => {
  const w = Math.ceil(width / cell) + 1, h = Math.ceil(height / cell) + 1;
  const mask = new Uint8Array(w * h);
  const cellOf: number[] = [];
  for (const t of trees) {
    const cx = t.x / cell, cy = t.y / cell, r = Math.max(4, t.r) / cell;
    cellOf.push(Math.min(h - 1, Math.max(0, Math.round(cy))) * w + Math.min(w - 1, Math.max(0, Math.round(cx))));
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * w + x] = 1;
  }
  const m = close(mask, w, h, Math.max(1, Math.round(gapFt / 2 / cell)));
  const comps = components(m, w, h, 4);
  const label = new Int32Array(w * h).fill(-1);
  comps.forEach((c, k) => { for (const i of c) label[i] = k; });
  const count = new Array(comps.length).fill(0);
  for (const i of cellOf) if (label[i] >= 0) count[label[i]]++;
  return { w, h, cell, stands: comps.flatMap((c, k) => (count[k] >= minTrees ? [{ outline: traceOutline(w, h, c), trees: count[k], areaPx: c.length }] : [])) };
};

/** How much of its most snug box (turned every 5 degrees) a shape fills: about 1 for a rectangle
 * (a pool, a court, a roof), about 0.79 for a round pond. */
export const boxFill = (outline: { x: number; y: number }[], areaPx: number) => {
  let best = Infinity;
  for (let deg = 0; deg < 90; deg += 5) {
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of outline) {
      const u = p.x * c + p.y * s, v = -p.x * s + p.y * c;
      if (u < x0) x0 = u;
      if (u > x1) x1 = u;
      if (v < y0) y0 = v;
      if (v > y1) y1 = v;
    }
    best = Math.min(best, (x1 - x0 + 1) * (y1 - y0 + 1));
  }
  return best > 0 ? areaPx / best : 0;
};

/**
 * Open water on a photo: clearly blue, smooth patches of at least `minAreaM2` that aren't
 * rectangles (pools, painted courts and roofs are; ponds and rivers aren't).
 */
export const waterRegions = (img: DetectImage, opts: Opts & { minAreaM2?: number }): Region[] => {
  const { width: w, height: h, data } = img;
  const mpp = opts.metersPerPx;
  const n = w * h;
  const luma = new Float32Array(n);
  const blue = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const sum = r + g + b + 1;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    if ((b - (r + g) / 2) / sum > 0.06 && sat > 0.22 && b >= g && !(opts.exclude && opts.exclude(i % w, (i / w) | 0))) blue[i] = 1;
  }
  // Water is smooth (ripples aside); a blue car or a tarp among busy surroundings isn't a pond
  const { std } = localStats(luma, w, h, Math.max(1, Math.round(1 / mpp)));
  for (let i = 0; i < n; i++) if (blue[i] && std[i] > 18) blue[i] = 0;
  let m = open(blue, w, h, Math.max(1, Math.round(0.6 / mpp)));
  m = close(m, w, h, Math.max(1, Math.round(1.5 / mpp)));
  const minPx = Math.ceil((opts.minAreaM2 ?? 150) / (mpp * mpp));
  return components(m, w, h, minPx)
    .map(c => ({ outline: traceOutline(w, h, c), areaPx: c.length }))
    .filter(r => boxFill(r.outline, r.areaPx) < 0.88);
};

export const detectTrees = (img: DetectImage, opts: Opts & { maxTrees?: number; canopy?: Canopy | null }): DetectedTree[] => {
  const found = opts.canopy !== undefined ? opts.canopy : canopyMask(img, opts);
  if (!found) return [];
  const { mask, luma, lawn, win, mpp, w, h, n } = found;
  const dt = distanceTransform(mask, w, h);
  // Crown tops: deep inside the canopy and sunlit (treetops catch the light).
  const lit = new Float32Array(n);
  for (let i = 0; i < n; i++) lit[i] = mask[i] ? luma[i] : 0;
  const litS = blur(lit, w, h, Math.max(1, Math.round(0.6 / mpp)));
  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) score[i] = mask[i] ? Math.min(dt[i], 2.5 / mpp) / (2.5 / mpp) + TREE_LIT * litS[i] / Math.max(lawn, 1) : 0;
  const sdt = blur(score, w, h, Math.max(1, Math.round(0.3 / mpp)));
  // Crown centers: peaks of the (smoothed) distance to the canopy edge.
  const minR = 1.1 / mpp;
  const peaks: { x: number; y: number; d: number }[] = [];
  const nb = Math.max(1, Math.round(1.2 / mpp));
  for (let y = nb; y < h - nb; y++) {
    for (let x = nb; x < w - nb; x++) {
      const i = y * w + x;
      const v = sdt[i];
      if (dt[i] < minR * 0.8 || !mask[i]) continue;
      let peak = true;
      for (let dy = -nb; dy <= nb && peak; dy++) for (let dx = -nb; dx <= nb; dx++) {
        if ((dx || dy) && sdt[i + dy * w + dx] > v) { peak = false; break; }
      }
      if (peak) peaks.push({ x, y, d: dt[i] });
    }
  }
  // Keep the biggest first; a smaller peak inside an accepted crown is the same tree. The canopy
  // mask loses a rim at the crown's edge (texture windows straddle it): allow for it.
  const rim = win + 1;
  peaks.sort((a, b) => b.d - a.d);
  const trees: (DetectedTree & { d: number })[] = [];
  for (const p of peaks) {
    const radius = Math.min(Math.max(p.d * 1.25 + rim * 0.5, minR), 9 / mpp);
    // Same crown as one already found (peaks inside its crown).
    if (trees.some(t => Math.hypot(t.x - p.x, t.y - p.y) < Math.max((t.radiusPx + rim) * 0.95, 2.2 / mpp))) continue;
    trees.push({ x: p.x, y: p.y, radiusPx: radius, d: p.d });
  }
  // Center each crown on its canopy (the peak can sit on the sunny side).
  for (let pass = 0; pass < 3; pass++) for (const t of trees) {
    const r = Math.ceil(t.radiusPx * 0.8);
    let sx = 0, sy = 0, c = 0;
    for (let y = Math.max(0, Math.round(t.y) - r); y <= Math.min(h - 1, Math.round(t.y) + r); y++) {
      for (let x = Math.max(0, Math.round(t.x) - r); x <= Math.min(w - 1, Math.round(t.x) + r); x++) {
        if (mask[y * w + x] && (x - t.x) ** 2 + (y - t.y) ** 2 <= r * r) { sx += x; sy += y; c++; }
      }
    }
    if (c > 0) { t.x = sx / c; t.y = sy / c; }
  }
  // A canopy patch holding a single tree is that tree: use its center and size.
  const label = new Int32Array(n).fill(-1);
  const patches = components(mask, w, h, 1);
  patches.forEach((c, k) => { for (const i of c) label[i] = k; });
  const perPatch = new Map<number, number[]>();
  trees.forEach((t, j) => {
    const k = label[Math.round(t.y) * w + Math.round(t.x)];
    if (k >= 0) perPatch.set(k, [...(perPatch.get(k) ?? []), j]);
  });
  for (const [k, list] of perPatch) {
    if (list.length !== 1) continue;
    const c = patches[k];
    let sx = 0, sy = 0;
    for (const i of c) { sx += i % w; sy += (i / w) | 0; }
    const t = trees[list[0]];
    t.x = sx / c.length;
    t.y = sy / c.length;
    t.radiusPx = Math.min(Math.sqrt(c.length / Math.PI) + rim * 0.5, 9 / mpp);
  }
  return trees.slice(0, opts.maxTrees ?? 300).map(({ x, y, radiusPx }) => ({ x, y, radiusPx }));
};

/** Mean of v over a (2r+1)^2 window, counting only pixels where m is set (and how many there were). */
const maskedMean = (v: Float32Array, m: Uint8Array, w: number, h: number, r: number) => {
  const W = w + 1;
  const sv = new Float64Array(W * (h + 1));
  const sm = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rv = 0, rm = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i]) { rv += v[i]; rm += 1; }
      sv[(y + 1) * W + x + 1] = sv[y * W + x + 1] + rv;
      sm[(y + 1) * W + x + 1] = sm[y * W + x + 1] + rm;
    }
  }
  const mean = new Float32Array(w * h);
  const share = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const c = sm[y1 * W + x1] - sm[y0 * W + x1] - sm[y1 * W + x0] + sm[y0 * W + x0];
      const s = sv[y1 * W + x1] - sv[y0 * W + x1] - sv[y1 * W + x0] + sv[y0 * W + x0];
      mean[y * w + x] = c > 0 ? s / c : 0;
      share[y * w + x] = c / ((y1 - y0) * (x1 - x0));
    }
  }
  return { mean, share };
};

// Tuned on real satellite photos (tests/fixtures/aerial): a hand-labelled parking lot, and homes.
const VEH_SCORE = 32; // how much a car's box stands out from the pavement around it
const VEH_INNER = 45; // how different from the pavement the box is (color distance)
const UNIFORM = 0.6; // every half of the box has at least this share of its contrast
const VEG_BUSY = 60; // plants or buildings around a box count as this much contrast
const GROUND_CHROMA = 40;
const BG_NEAR = 60;
const VEG_GB = 1.04;
const EXT_LEVEL = 0.45; // where a thing ends: contrast below this share of its middle's
const VEH_MAX_LEN = 9; // m: longer is a curb, a planter or a shed, not a car
const SOIL_RB = 30; // tan: red this much over blue
const SHADOW_K = 0.4;
const SHADOW_STD = 10;

// A car-sized box (and the pavement strips around it) at one orientation, over a contrast map:
// the box's mean contrast, its two sides' and its two ends' (all as box means, via an integral image
// of the map turned so the box's length runs along the rows).
const CAR_ANGLES = 8;
const boxScores = (
  C: Float32Array, Cs: Float32Array, cand: Uint8Array, w: number, h: number, theta: number,
  half: { len: number; wid: number; gap: number; strip: number }
) => {
  const cos = Math.cos(theta), sin = Math.sin(theta);
  // Rotated frame: u along the car, v across it.
  const us = [0, w, 0, w].map((x, i) => x * cos + (i < 2 ? 0 : h) * sin);
  const vs = [0, w, 0, w].map((x, i) => -x * sin + (i < 2 ? 0 : h) * cos);
  const u0 = Math.floor(Math.min(...us)) - 1, v0 = Math.floor(Math.min(...vs)) - 1;
  const W = Math.ceil(Math.max(...us)) - u0 + 2, H = Math.ceil(Math.max(...vs)) - v0 + 2;
  const integral = (M: Float32Array) => {
    const S = new Float64Array((W + 1) * (H + 1));
    for (let j = 0; j < H; j++) {
      let row = 0;
      for (let i = 0; i < W; i++) {
        const u = i + u0, v = j + v0;
        const xi = Math.round(u * cos - v * sin), yi = Math.round(u * sin + v * cos);
        row += xi >= 0 && yi >= 0 && xi < w && yi < h ? M[yi * w + xi] : 0;
        S[(j + 1) * (W + 1) + i + 1] = S[j * (W + 1) + i + 1] + row;
      }
    }
    // Mean over inclusive rotated-pixel ranges [a..c] x [b..d], clamped
    return (a: number, b: number, c: number, d: number) => {
      a = Math.max(0, a); b = Math.max(0, b); c = Math.min(W - 1, c); d = Math.min(H - 1, d);
      if (c < a || d < b) return 0;
      return (S[(d + 1) * (W + 1) + c + 1] - S[b * (W + 1) + c + 1] - S[(d + 1) * (W + 1) + a] + S[b * (W + 1) + a]) / ((c - a + 1) * (d - b + 1));
    };
  };
  const box = integral(C);
  const boxS = integral(Cs);
  const { len, wid, gap, strip } = half;
  const inner = new Float32Array(w * h), around = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!cand[y * w + x]) continue;
      const i = Math.round(x * cos + y * sin) - u0, j = Math.round(-x * sin + y * cos) - v0;
      const sIn = box(i - len, j - wid, i + len, j + wid);
      const l2 = Math.round(len * 0.8), w2 = Math.max(1, Math.round(wid * 0.8));
      const sideA = boxS(i - l2, j - wid - gap - strip, i + l2, j - wid - gap - 1);
      const sideB = boxS(i - l2, j + wid + gap + 1, i + l2, j + wid + gap + strip);
      const endA = boxS(i - len - gap - strip, j - w2, i - len - gap - 1, j + w2);
      const endB = boxS(i + len + gap + 1, j - w2, i + len + gap + strip, j + w2);
      // A car fills its box: every half has contrast (a box half over the edge of something big doesn't).
      const halves = Math.min(
        box(i - len, j - wid, i + len, j - 1), box(i - len, j + 1, i + len, j + wid),
        box(i - len, j - wid, i - 1, j + wid), box(i + 1, j - wid, i + len, j + wid)
      );
      inner[y * w + x] = halves < UNIFORM * sIn ? 0 : sIn;
      // Clear pavement around it, allowing for one busy neighbour (a car alongside, its own
      // shadow), cars on both sides (a row in a lot) or at both ends (parked nose to tail), but
      // not a side and an end together (the corner of something big).
      const q = [sideA, sideB, endA, endB].sort((p, r) => r - p);
      around[y * w + x] = Math.min(q[1], Math.max(endA, endB), Math.max(sideA, sideB));
    }
  }
  return { inner, around };
};

/**
 * Parked cars: car-sized boxes that stand out from the pavement around them (any paint: compared
 * with the pavement's own color nearby), with clear pavement on at least one side and one end.
 * Each car is its own peak, so cars parked side by side or nose to tail come out one by one,
 * while long things (curbs, painted lines), big things (sheds, shade) and big shadows don't.
 */
export const detectVehicles = (img: DetectImage, opts: Opts & { maxVehicles?: number }): DetectedVehicle[] => {
  const { width: w, height: h, data } = img;
  const mpp = opts.metersPerPx;
  const n = w * h;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  const ground = new Uint8Array(n); // pavement-like (grey, not green): the background cars sit on
  const usable = new Uint8Array(n); // not vegetation, not a building
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    R[i] = r; G[i] = g; B[i] = b;
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    // Vegetation: green over both red and blue (a bluish-white car or its halo is not a plant).
    const green = (2 * g - r - b) / (r + g + b + 1) > 0.04 && g > r && g > b * VEG_GB;
    const excluded = opts.exclude ? opts.exclude(i % w, (i / w) | 0) : false;
    if (green || excluded) continue;
    usable[i] = 1;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < GROUND_CHROMA && L > 45 && L < 225) ground[i] = 1;
  }
  // The pavement's color around each pixel, over ~7 m (wider than a row of cars is deep). Cars
  // themselves are often grey too, so average again over just the pixels near that first guess:
  // the pavement, not the cars on it.
  const bgR = Math.max(3, Math.round(3.5 / mpp));
  let mr = maskedMean(R, ground, w, h, bgR);
  let mg = maskedMean(G, ground, w, h, bgR).mean;
  let mb = maskedMean(B, ground, w, h, bgR).mean;
  for (let pass = 0; pass < 2; pass++) {
    const near = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!ground[i] || mr.share[i] === 0) continue;
      const d = Math.abs(R[i] - mr.mean[i]) + Math.abs(G[i] - mg[i]) + Math.abs(B[i] - mb[i]);
      if (d < BG_NEAR) near[i] = 1;
    }
    const m2 = maskedMean(R, near, w, h, bgR);
    const g2 = maskedMean(G, near, w, h, bgR).mean, b2 = maskedMean(B, near, w, h, bgR).mean;
    for (let i = 0; i < n; i++) {
      if (m2.share[i] > 0.05) { mr.mean[i] = m2.mean[i]; mg[i] = g2[i]; mb[i] = b2[i]; }
    }
    mr = { mean: mr.mean, share: mr.share };
  }
  // How far each pixel is from the pavement's color (0 on vegetation, buildings, and where there is no pavement around).
  const C = new Float32Array(n);
  const Lum = new Float32Array(n);
  for (let i = 0; i < n; i++) Lum[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
  const { std } = localStats(Lum, w, h, Math.max(1, Math.round(0.4 / mpp)));
  for (let i = 0; i < n; i++) {
    if (!usable[i] || mr.share[i] < 0.12) continue;
    const dr = R[i] - mr.mean[i], dg = G[i] - mg[i], db = B[i] - mb[i];
    let c = Math.min(160, Math.sqrt(dr * dr + dg * dg + db * db));
    // Shadow on the pavement: the same grey, darker and smooth. Counts for little. (Black paint is
    // darker than a shadow on pavement, so it still counts.)
    const bgL = 0.299 * mr.mean[i] + 0.587 * mg[i] + 0.114 * mb[i];
    const chroma = Math.max(R[i], G[i], B[i]) - Math.min(R[i], G[i], B[i]);
    if (Lum[i] > bgL * 0.42 && Lum[i] < bgL * 0.8 && chroma < 20 && std[i] < SHADOW_STD) c *= SHADOW_K;
    C[i] = c;
  }
  // Around a car: pavement. Plants and buildings there count as busy, not as clear pavement.
  const Cs = new Float32Array(n);
  for (let i = 0; i < n; i++) Cs[i] = usable[i] && mr.share[i] >= 0.12 ? C[i] : VEG_BUSY;
  const half = {
    len: Math.max(2, Math.round(2.15 / mpp)),
    wid: Math.max(1, Math.round(0.8 / mpp)),
    gap: Math.max(1, Math.round(0.25 / mpp)),
    strip: Math.max(1, Math.round(0.55 / mpp))
  };
  // Only where there's enough contrast nearby to be a car (most of a site is lawn, roofs or bare pavement).
  const near = localStats(C, w, h, half.wid).mean;
  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (near[i] > VEH_INNER * 0.5) cand[i] = 1;
  const best = new Float32Array(n), bestIn = new Float32Array(n), bestK = new Uint8Array(n);
  const inners: Float32Array[] = [];
  for (let k = 0; k < CAR_ANGLES; k++) {
    const theta = (k * Math.PI) / CAR_ANGLES;
    const { inner, around } = boxScores(C, Cs, cand, w, h, theta, half);
    inners.push(inner);
    for (let i = 0; i < n; i++) {
      const s = inner[i] - around[i];
      if (s > best[i]) { best[i] = s; bestIn[i] = inner[i]; bestK[i] = k; }
    }
  }
  // Long the right way: the box along the car holds more of it than the box turned across.
  for (let i = 0; i < n; i++) {
    if (best[i] > 0 && inners[(bestK[i] + CAR_ANGLES / 2) % CAR_ANGLES][i] > bestIn[i]) best[i] = 0;
  }
  const bestA = (i: number) => (bestK[i] * Math.PI) / CAR_ANGLES;
  // Peaks: strong enough, and the highest within about a car's half width.
  const r = Math.max(1, Math.round(0.9 / mpp));
  const peaks: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (best[i] < VEH_SCORE || bestIn[i] < VEH_INNER) continue;
      let top = true;
      for (let dy = -r; dy <= r && top; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue;
          if (best[yy * w + xx] > best[i]) { top = false; break; }
        }
      }
      if (top) peaks.push(i);
    }
  }
  peaks.sort((a, b) => best[b] - best[a]);
  const out: DetectedVehicle[] = [];
  const lengthPx = (2 * half.len + 1), widthPx = (2 * half.wid + 1);
  // How far the thing at (x, y) reaches along direction (ux, uy), averaging over its breadth
  // (perpendicular, +-b px): until its contrast falls well below its middle's.
  const reach = (x: number, y: number, ux: number, uy: number, b: number, level: number, max: number) => {
    let below = 0;
    for (let t = 1; t <= max; t++) {
      let sum = 0, cnt = 0;
      for (let k = -b; k <= b; k++) {
        const xx = Math.round(x + ux * t - uy * k), yy = Math.round(y + uy * t + ux * k);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        sum += C[yy * w + xx]; cnt++;
      }
      if (!cnt || sum / cnt < level) { if (++below >= 2) return t - 1; } else below = 0;
    }
    return max;
  };
  for (const i of peaks) {
    const x = i % w, y = (i / w) | 0, a = bestA(i);
    // Its size: a car is about 3-7 m long and under about 3 m wide (sheds, planters, curbs are bigger).
    const ux = Math.cos(a), uy = Math.sin(a), level = bestIn[i] * EXT_LEVEL;
    const maxL = Math.round(6 / mpp);
    const along = (reach(x, y, ux, uy, Math.max(1, Math.round(half.wid * 0.6)), level, maxL) + reach(x, y, -ux, -uy, Math.max(1, Math.round(half.wid * 0.6)), level, maxL) + 1) * mpp;
    if (along > VEH_MAX_LEN) continue;
    // What the box holds, on average, isn't tan like sand, soil or mulch.
    {
      let r = 0, g = 0, bb = 0, cnt = 0;
      for (let t = -half.len; t <= half.len; t++) for (let k = -half.wid; k <= half.wid; k++) {
        const xx = Math.round(x + ux * t - uy * k), yy = Math.round(y + uy * t + ux * k);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx; r += R[q]; g += G[q]; bb += B[q]; cnt++;
      }
      r /= cnt; g /= cnt; bb /= cnt;
      if (r > g && g > bb && r - bb > SOIL_RB && r - bb > 0.2 * r) continue;
    }
    // Not inside a car already found (a car's own outline is one car).
    const clash = out.some(c => {
      const ca = (c.angleDeg * Math.PI) / 180;
      const dx = x - c.x, dy = y - c.y;
      const along = Math.abs(dx * Math.cos(ca) + dy * Math.sin(ca));
      const across = Math.abs(-dx * Math.sin(ca) + dy * Math.cos(ca));
      return (along < c.lengthPx * 0.75 && across < c.widthPx * 0.9) || Math.hypot(dx, dy) < 1.8 / mpp;
    });
    if (clash) continue;
    out.push({ x, y, lengthPx, widthPx, angleDeg: (a * 180) / Math.PI });
  }
  return out.slice(0, opts.maxVehicles ?? 80);
};
