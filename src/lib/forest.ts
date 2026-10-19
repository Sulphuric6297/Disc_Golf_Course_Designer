// The painted land for the "Forest" map style, after hand-painted course maps on park signs: a
// dense canopy of small treetops of many sizes, lit from the top left, with fine leaf grain and
// shadows cast onto the clearings; bright fairways with lighter middles; dirt trails between holes
// and worn dirt at the tees; creeks and ponds in clear blue with dark banks; soft gray roads and
// mown grass. It is one picture for the whole map, laid into the SVG under the symbols.
import { CIRCLE_ONE_FT, LINE_KINDS } from "../constants";
import type { AreaItem, CourseDoc, LineItem, MapStyle, P, TreeItem } from "../types";
import { canopyMask } from "./geo/detect";
import { corridor, dist, pathLength, pointAlong, smoothPath } from "./geom";
import type { HoleStats } from "./holeStats";

/** Where the photo shows trees, on a grid over the site (1 = canopy). */
export type CanopyGrid = { cols: number; rows: number; ftPerCell: number; data: Uint8Array };

export type ForestMode = "everywhere" | "photo" | "woods";

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

let photoCache: { url: string; grid: CanopyGrid | null } | null = null;

/** The canopy on the site's photo (worked out once per photo, at about half a meter). */
export const canopyFromPhoto = async (url: string, widthFt: number): Promise<CanopyGrid | null> => {
  if (photoCache?.url === url) return photoCache.grid;
  try {
    const img = await loadImage(url);
    const widthM = widthFt / 3.28084;
    const scale = Math.min(1, widthM / 0.5 / img.naturalWidth);
    const w = Math.max(16, Math.round(img.naturalWidth * scale)), h = Math.max(16, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const found = canopyMask(ctx.getImageData(0, 0, w, h), { metersPerPx: widthM / w });
    const grid: CanopyGrid | null = found ? { cols: w, rows: h, ftPerCell: widthFt / w, data: found.mask } : null;
    photoCache = { url, grid };
    return grid;
  } catch {
    return null;
  }
};

/** The canopy for a course's map, when its style paints the forest from the photo. */
export const canopyFor = async (doc: CourseDoc) =>
  doc.style.theme === "forest" && doc.style.forest !== "everywhere" && doc.background ? canopyFromPhoto(doc.background, doc.canvas.width) : null;

// --- Randomness and noise (the same picture every time for the same course)

/** A small seeded random generator (mulberry32). */
export const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const NOISE = (() => {
  const r = seeded(91);
  const a = new Float32Array(256 * 256);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
})();

/** Smooth value noise, 0..1, one bump per unit. */
const noise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  let u = x - xi, v = y - yi;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  const x0 = xi & 255, x1 = (x0 + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
  const a = NOISE[y0 + x0], b = NOISE[y0 + x1], c = NOISE[y1 + x0], d = NOISE[y1 + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/** Three octaves of noise, each turned so no grid shows (about 0..1, mostly near 0.5). */
const fbm = (x: number, y: number) =>
  noise(x, y) * 0.55 +
  noise(x * 1.62 - y * 1.22 + 17.1, x * 1.22 + y * 1.62 + 3.7) * 0.3 +
  noise(x * 2.05 + y * 3.57 + 41.3, -x * 3.57 + y * 2.05 + 9.2) * 0.15;

// Fine grain (leaves, grass, grit), made once: 512-pixel squares that repeat without a seam (the
// noise repeats every 256 units, and these frequencies fit that)
let fine: { leaf: Float32Array; grain: Float32Array; grit: Float32Array } | null = null;
const fineGrain = () => {
  if (fine) return fine;
  const n = 512 * 512;
  const leaf = new Float32Array(n), grain = new Float32Array(n), grit = new Float32Array(n);
  for (let y = 0, i = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++, i++) {
      leaf[i] = noise(x * 0.5, y * 0.5) * 0.6 + noise(x + 19, y + 5) * 0.4;
      grain[i] = noise(x + 101, y + 37) - 0.5;
      grit[i] = noise(x + 300, y + 70);
    }
  }
  return (fine = { leaf, grain, grit });
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type RGB = [number, number, number];
const hexRgb = (hex: string): RGB => {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const times = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/**
 * A line that winds like a creek or a trail: long straight stretches (drawn with few clicks) get
 * bends, lines that already follow the ground closely (many points) only a little wobble.
 */
export const meander = (pts: P[], amp: number, wave: number, seed: number): P[] => {
  if (pts.length < 2 || amp <= 0) return pts;
  const rnd = seeded(seed);
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const out: P[] = [];
  const step = Math.max(1, wave / 14);
  let s = 0;
  const total = pathLength(pts);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = dist(a, b);
    if (len < 1e-6) continue;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    // Long straight pieces bend fully; short ones (already following a real creek) barely
    const bend = Math.min(1, len / wave);
    const n = Math.max(1, Math.ceil(len / step));
    for (let j = i === 1 ? 0 : 1; j <= n; j++) {
      const t = j / n, d = s + len * t;
      const taper = Math.min(1, d / (wave * 0.5), (total - d) / (wave * 0.5));
      const off = amp * taper * (bend * (0.62 * Math.sin((d / wave) * 6.28 + ph[0]) + 0.28 * Math.sin((d / (wave * 0.41)) * 6.28 + ph[1])) + 0.18 * Math.sin((d / (wave * 0.13)) * 6.28 + ph[2]));
      out.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off });
    }
    s += len;
  }
  return out;
};

const idSeed = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

export type ForestView = { cx: number; cy: number; rotation: number; scale: number; width: number; height: number };

export type ForestOpts = {
  mode: ForestMode;
  canopy: CanopyGrid | null;
  style: MapStyle;
  /** Pixels per page point. */
  density?: number;
};

/**
 * The painted land over the map view, as a canvas `density` times the view's size (the view is
 * in page points; `view.scale` is points per foot).
 */
export const forestCanvas = (doc: CourseDoc, view: ForestView, stats: HoleStats[], opts: ForestOpts) => {
  const density = opts.density ?? 2;
  const s = opts.style;
  const W = Math.max(1, Math.round(view.width * density)), H = Math.max(1, Math.round(view.height * density));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const k = view.scale * density; // pixels per foot
  const pt = density; // pixels per page point
  const ftOf = (points: number) => (points * pt) / k;
  const rot = (view.rotation * Math.PI) / 180;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  const toScreen = (p: P) => {
    const dx = p.x - view.cx, dy = p.y - view.cy;
    return { x: W / 2 + (dx * cos - dy * sin) * k, y: H / 2 + (dx * sin + dy * cos) * k };
  };
  const toPlan = (x: number, y: number) => {
    const sx = (x - W / 2) / k, sy = (y - H / 2) / k;
    return { x: view.cx + sx * cos + sy * sin, y: view.cy - sx * sin + sy * cos };
  };

  // ---------------------------------------------------------------- what is where (masks)
  // Three small pictures, one cell per two pixels, a kind of ground in each color channel:
  //   A: fairway, clear of trees, water    B: dirt, road, drawn woods    C: building, sand, fairway middle
  const cell = 2;
  const mw = Math.ceil(W / cell), mh = Math.ceil(H / cell);
  const mk = k / cell;
  const mask = () => {
    const c = document.createElement("canvas");
    c.width = mw;
    c.height = mh;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#000";
    g.fillRect(0, 0, mw, mh);
    g.setTransform(mk * cos, mk * sin, -mk * sin, mk * cos, mw / 2 - (view.cx * cos - view.cy * sin) * mk, mh / 2 - (view.cx * sin + view.cy * cos) * mk);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.lineJoin = "round";
    return { c, g };
  };
  const A = mask(), B = mask(), C = mask();
  type Ch = { g: CanvasRenderingContext2D; color: string };
  const ch = (m: { g: CanvasRenderingContext2D }, i: 0 | 1 | 2, v = 255): Ch => ({ g: m.g, color: `rgb(${i === 0 ? v : 0},${i === 1 ? v : 0},${i === 2 ? v : 0})` });
  const FAIR = ch(A, 0), CLEAR = ch(A, 1), WATER = ch(A, 2);
  const DIRT = ch(B, 0), ROAD = ch(B, 1), WOODS = ch(B, 2);
  const BUILDING = ch(C, 0), SAND = ch(C, 1), MIDDLE = ch(C, 2);
  const poly = (c: Ch, pts: P[]) => {
    if (pts.length < 3) return;
    c.g.fillStyle = c.color;
    c.g.beginPath();
    pts.forEach((p, i) => (i ? c.g.lineTo(p.x, p.y) : c.g.moveTo(p.x, p.y)));
    c.g.closePath();
    c.g.fill();
  };
  const disc = (c: Ch, p: P, r: number) => {
    c.g.fillStyle = c.color;
    c.g.beginPath();
    c.g.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.g.fill();
  };
  const line = (c: Ch, pts: P[], width: number) => {
    if (pts.length < 2) return;
    c.g.strokeStyle = c.color;
    c.g.lineWidth = width;
    c.g.beginPath();
    pts.forEach((p, i) => (i ? c.g.lineTo(p.x, p.y) : c.g.moveTo(p.x, p.y)));
    c.g.stroke();
  };
  /** A line of varying width (creeks): short pieces, each a little wider or narrower. */
  const wobblyLine = (c: Ch, pts: P[], width: number, seed: number) => {
    const rnd = seeded(seed);
    let w = width;
    for (let i = 1; i < pts.length; i++) {
      w = Math.max(width * 0.6, Math.min(width * 1.45, w + (rnd() - 0.5) * width * 0.35));
      line(c, [pts[i - 1], pts[i]], w);
    }
  };

  // Treetops a few points across on a course map (they read as texture, as on painted maps), and
  // bigger on a close-up like a tee sign's hole map
  const crownR = (Math.min(12, Math.max(2.8, 26 * view.scale * 0.25)) / 2) * pt;

  for (const st of stats) {
    const hole = doc.holes.find(h => h.id === st.holeId);
    if (!st.complete || !hole) continue;
    const path = smoothPath(st.line, 10);
    const width = Math.max(18, hole.fairwayWidth * (hole.fairway ? 1 : 0.6));
    poly(FAIR, corridor(path, width, 12));
    // Treetops lean in over the edges: keep their middles back so the fairway keeps its width
    poly(CLEAR, corridor(path, width + (crownR * 1.2) / k, 12));
    poly(MIDDLE, corridor(path, width * 0.4, 12));
  }
  for (const i of doc.items) {
    if (i.type === "tee") {
      const r = Math.max(12, i.padLength * 0.9);
      disc(FAIR, i, r);
      disc(CLEAR, i, r + 4);
      // Worn dirt around the pad
      disc(ch(B, 0, 175), i, Math.max(7, i.padLength * 0.75));
    } else if (i.type === "basket") {
      disc(FAIR, i, CIRCLE_ONE_FT * 0.75);
      disc(CLEAR, i, CIRCLE_ONE_FT * 0.8);
      disc(MIDDLE, i, CIRCLE_ONE_FT * 0.45);
      disc(ch(B, 0, 110), i, 7);
    } else if (i.type === "dropzone") {
      disc(FAIR, i, 12);
      disc(CLEAR, i, 12);
    } else if (i.type === "amenity") {
      disc(CLEAR, i, 10);
    } else if (i.type === "area") {
      const a = i as AreaItem;
      if (a.kind === "fairway" || a.kind === "green") { poly(FAIR, a.points); poly(CLEAR, a.points); if (a.kind === "green") poly(MIDDLE, a.points); }
      else if (a.kind === "water") { poly(WATER, a.points); poly(CLEAR, a.points); }
      else if (a.kind === "parking") { poly(ROAD, a.points); poly(CLEAR, a.points); }
      else if (a.kind === "building") { poly(BUILDING, a.points); poly(CLEAR, a.points); }
      else if (a.kind === "sand") { poly(SAND, a.points); poly(CLEAR, a.points); }
      else if (a.kind === "rough" || a.kind === "nogo") poly(CLEAR, a.points);
      else if (a.kind === "woods") poly(WOODS, a.points);
    } else if (i.type === "line") {
      const l = i as LineItem;
      const w = l.width ?? LINE_KINDS[l.kind].width;
      if (l.kind === "road") {
        const rw = Math.max(w, ftOf(3.5));
        line(ROAD, l.points, rw);
        line(CLEAR, l.points, rw + ftOf(2));
      } else if (l.kind === "path" || l.kind === "walk") {
        const tw = Math.max(w, ftOf(3.6));
        const pts = meander(smoothPath(l.points, 8), tw * 0.9, Math.max(40, tw * 14), idSeed(l.id));
        line(DIRT, pts, tw);
        line(CLEAR, pts, tw + (crownR * 2.4) / k);
      } else if (l.kind === "stream") {
        const cw = Math.max(w, ftOf(5.5));
        const pts = smoothPath(meander(l.points, cw * 1.6, Math.max(50, cw * 11), idSeed(l.id)), 3);
        wobblyLine(WATER, pts, cw, idSeed(l.id) + 1);
        // Crowns lean over the banks a little
        line(CLEAR, pts, cw + (crownR * 1.4) / k);
      }
    }
  }
  // Dirt trails from each basket to the next tee
  if (s.nextTee) {
    for (let i = 0; i + 1 < stats.length; i++) {
      const a = stats[i], b = stats[i + 1];
      if (!a.complete || !b.complete) continue;
      const from = a.line[a.line.length - 1], to = b.line[0];
      const d = dist(from, to);
      if (d < 40) continue;
      const tw = Math.max(5, ftOf(3.6));
      const pts = smoothPath(meander([from, to], Math.min(d * 0.07, 30), Math.max(70, d * 0.55), idSeed(a.holeId + b.holeId)), 3);
      line(DIRT, pts, tw);
      line(CLEAR, pts, tw + (crownR * 2.4) / k);
    }
  }
  const read = (c: HTMLCanvasElement, blur: number) => {
    const o = document.createElement("canvas");
    o.width = mw;
    o.height = mh;
    const g = o.getContext("2d", { willReadFrequently: true })!;
    if (blur > 0) g.filter = `blur(${blur}px)`;
    g.drawImage(c, 0, 0);
    return g.getImageData(0, 0, mw, mh).data;
  };
  const a = read(A.c, 1.2 * (pt / cell)), b = read(B.c, 0.9 * (pt / cell)), c = read(C.c, 1 * (pt / cell));
  const wet = read(A.c, 0.6 * (pt / cell));
  const middle = read(C.c, 7 * (pt / cell));

  // Slow-changing noise on a coarse grid (every 8 pixels), read smoothly in between. In page
  // points, so a print looks like the screen.
  const CS = 8;
  const cw = Math.ceil(W / CS) + 2, chh = Math.ceil(H / CS) + 2;
  const coarse = (f: (u: number, v: number) => number) => {
    const out = new Float32Array(cw * chh);
    for (let y = 0, j = 0; y < chh; y++) for (let x = 0; x < cw; x++, j++) out[j] = f((x * CS) / pt, (y * CS) / pt) - 0.5;
    return out;
  };
  const at = (g: Float32Array, x: number, y: number) => {
    const fx = x / CS, fy = y / CS;
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, j = iy * cw + ix;
    return (g[j] * (1 - tx) + g[j + 1] * tx) * (1 - ty) + (g[j + cw] * (1 - tx) + g[j + cw + 1] * tx) * ty;
  };
  const mottle = coarse((u, v) => fbm(u * 0.05, v * 0.05));
  const fairMottle = coarse((u, v) => fbm(u * 0.07 + 20, v * 0.07));
  const stands = coarse((u, v) => fbm(u * 0.018 + 5, v * 0.018 + 9));
  const treeEdge = coarse((u, v) => fbm(u * 0.09 + 31, v * 0.09 + 7));
  const clumps = coarse((u, v) => fbm(u * 0.035 + 61, v * 0.035 + 2));
  const { leaf: LEAF, grain: GRAIN, grit: GRIT } = fineGrain();

  // Wooded, cell by cell: drawn woods; or everywhere, or where the photo shows trees
  const site = (p: P) => p.x >= -doc.canvas.width * 0.5 && p.y >= -doc.canvas.height * 0.5 && p.x <= doc.canvas.width * 1.5 && p.y <= doc.canvas.height * 1.5;
  const canopy = opts.canopy;
  const photoTrees = (p: P) => {
    if (!canopy) return false;
    const cc = Math.floor(p.x / canopy.ftPerCell), rr = Math.floor(p.y / canopy.ftPerCell);
    // Beyond the photo nothing is known: paint it wooded, so the page's edges stay lush
    if (cc < 0 || rr < 0 || cc >= canopy.cols || rr >= canopy.rows) return site(p);
    const reach = Math.max(1, Math.round(6 / canopy.ftPerCell));
    let hits = 0, all = 0;
    for (let dy = -reach; dy <= reach; dy += reach) for (let dx = -reach; dx <= reach; dx += reach) {
      const x = cc + dx, y = rr + dy;
      if (x < 0 || y < 0 || x >= canopy.cols || y >= canopy.rows) continue;
      all++;
      if (canopy.data[y * canopy.cols + x]) hits++;
    }
    return hits >= Math.max(2, all * 0.3);
  };
  const wooded = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const m = y * mw + x;
      // A wobbly edge where the trees stop
      if (a[m * 4 + 1] / 255 + at(treeEdge, x * cell + 1, y * cell + 1) * 0.5 > 0.5) continue;
      if (b[m * 4 + 2] > 127) { wooded[m] = 1; continue; }
      if (opts.mode === "woods") continue;
      const p = toPlan(x * cell + cell / 2, y * cell + cell / 2);
      wooded[m] = (opts.mode === "everywhere" || !canopy ? site(p) : photoTrees(p)) ? 1 : 0;
    }
  }

  // ---------------------------------------------------------------- the ground
  const cover = Math.max(0.1, Math.min(1, s.treeCover ?? 1));
  const grass = hexRgb(s.rough);
  const fairEdge = times(hexRgb(s.fairway), 0.86);
  const fairMid = mix(hexRgb(s.fairway), [232, 244, 170], 0.5);
  const dirt = times(hexRgb(s.path), 1.1);
  const water = hexRgb(s.water);
  const bank = mix(water, [10, 52, 50], 0.62);
  const road: RGB = [184, 185, 180], roadEdge: RGB = [139, 141, 135];
  const roof: RGB = [204, 197, 182], roofEdge: RGB = [96, 89, 77];
  const sand: RGB = [222, 203, 156];
  // Under thick woods the floor is deep shade; in sparse woods it is grass between the trees
  const thick = smooth(0.55, 1, cover);
  const floor = mix(times(grass, 0.78), times(hexRgb(s.trees), 0.3), thick);
  const img = ctx.createImageData(W, H);
  const o = img.data;
  // (Plain numbers per channel: this runs for every pixel)
  const [fe0, fe1, fe2] = fairEdge, [fm0, fm1, fm2] = fairMid;
  let cr = 0, cg = 0, cb = 0;
  const over = (c: RGB, kk: number, t: number) => {
    cr += (c[0] * kk - cr) * t;
    cg += (c[1] * kk - cg) * t;
    cb += (c[2] * kk - cb) * t;
  };
  for (let y = 0; y < H; y++) {
    const my = Math.min(mh - 1, y >> 1) * mw;
    const tr = (y & 511) << 9;
    for (let x = 0; x < W; x++) {
      const m = my + Math.min(mw - 1, x >> 1), m4 = m * 4, i = (y * W + x) * 4;
      const mott = at(mottle, x, y);
      const grain = GRAIN[tr | (x & 511)];
      const lit = 1 + mott * 0.18 + grain * 0.06;
      if (wooded[m]) {
        const kk = thick > 0.99 ? 1 : lit;
        cr = floor[0] * kk; cg = floor[1] * kk; cb = floor[2] * kk;
      } else {
        cr = grass[0] * lit; cg = grass[1] * lit; cb = grass[2] * lit;
      }
      // Fairways: bright, lighter down the middle and around the baskets, soft ragged edges
      const f = a[m4] / 255, r = b[m4 + 1] / 255;
      const rag = f > 0.05 || r > 0.2 ? fbm(x / pt * 0.16 + 50, y / pt * 0.16) - 0.5 : 0;
      if (f > 0.05) {
        const fa = smooth(0.35, 0.6, f + rag * 0.35);
        if (fa > 0) {
          const mid = smooth(0.08, 0.85, middle[m4 + 2] / 255);
          const kk = 1 + at(fairMottle, x, y) * 0.2 + grain * 0.05;
          cr += ((fe0 + (fm0 - fe0) * mid) * kk - cr) * fa;
          cg += ((fe1 + (fm1 - fe1) * mid) * kk - cg) * fa;
          cb += ((fe2 + (fm2 - fe2) * mid) * kk - cb) * fa;
        }
      }
      const sa = c[m4 + 1] / 255;
      if (sa > 0.3) over(sand, 1 + grain * 0.12, smooth(0.4, 0.6, sa));
      // Roads and parking: soft gray, darker at the edges, a little gravel
      if (r > 0.2) over(mix(roadEdge, road, smooth(0.5, 0.9, r)), 1 + grain * 0.1 + mott * 0.05, smooth(0.32, 0.55, r + rag * 0.12));
      // Dirt: fuzzy edged, speckled with lighter and darker grit
      const d = b[m4] / 255;
      if (d > 0.1) {
        const da = smooth(0.4, 0.6, d + (fbm(x / pt * 0.35 + 80, y / pt * 0.35) - 0.5) * 0.55);
        if (da > 0) {
          const grit = GRIT[tr | (x & 511)];
          over(dirt, 1 + (grit > 0.75 ? 0.22 : grit < 0.22 ? -0.18 : 0) + mott * 0.12, da);
        }
      }
      const bd = c[m4] / 255;
      if (bd > 0.25) over(mix(roofEdge, roof, smooth(0.55, 0.75, bd)), 1, smooth(0.3, 0.5, bd));
      // Water: a dark bank, then lighter near the shore, deeper in the middle
      const w0 = wet[m4 + 2] / 255;
      if (w0 > 0.25) {
        const w = w0 + (fbm(x / pt * 0.25 + 120, y / pt * 0.25) - 0.5) * 0.1;
        if (w > 0.36) {
          let wc = mix(bank, water, smooth(0.4, 0.52, w));
          wc = mix(wc, [168, 214, 240], Math.max(0, 1 - Math.abs(w - 0.62) / 0.1) * 0.3);
          const deep = w > 0.9 ? 1 - (w - 0.9) * 0.6 : 1;
          over(wc, deep * (1 + (noise(x / pt * 0.6 + 7, y / pt * 0.18) - 0.5) * 0.1), smooth(0.36, 0.44, w));
        }
      }
      o[i] = cr;
      o[i + 1] = cg;
      o[i + 2] = cb;
      o[i + 3] = 255;
    }
  }

  // ---------------------------------------------------------------- the canopy (a height field)
  const height = new Float32Array(W * H);
  const kind = new Uint8Array(W * H);
  /** A treetop: a lumpy dome, `top` high at the middle; the taller one wins where they overlap. */
  const stamp = (cx: number, cy: number, r: number, top: number, t: number) => {
    const x0 = Math.max(0, Math.floor(cx - r * 1.2)), x1 = Math.min(W - 1, Math.ceil(cx + r * 1.2));
    const y0 = Math.max(0, Math.floor(cy - r * 1.2)), y1 = Math.min(H - 1, Math.ceil(cy + r * 1.2));
    const ir2 = 1 / (r * r);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy, dy2 = dy * dy, tr = (y & 511) << 9;
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        const dx = x + 0.5 - cx;
        // Leafy outline: the edge pushed in and out by the leaf grain
        const q = 1 - (dx * dx + dy2) * ir2 * (0.78 + LEAF[tr | (x & 511)] * 0.5);
        if (q <= 0) continue;
        const h = top - r + r * Math.sqrt(q);
        if (h > height[i]) { height[i] = h; kind[i] = t; }
      }
    }
  };
  /** A bigger single tree: a few leafy clumps (each lit on its own), higher in the middle. */
  const clumpTree = (cx: number, cy: number, R: number, t: number) => {
    const tr = seeded(Math.round(cx * 7 + cy * 13));
    const n = 3 + Math.round((R / crownR) * 2.5);
    stamp(cx, cy, R * 0.7, R * 1.3, t);
    for (let j = 0; j < n; j++) {
      const a = tr() * Math.PI * 2, d = Math.sqrt(tr()) * R * 0.55;
      const r = Math.min(R * 0.6, crownR * (0.8 + tr() * 0.6));
      stamp(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, R * 1.25 + r * 0.4 - d * 0.3, t);
    }
  };
  const rnd = seeded(idSeed(doc.id ?? doc.name) ^ 0x5bd1e995);
  // Stratified at random (no grid shows): one or two treetops in each small square, all sizes.
  // Sparse woods keep fewer, in clumps, and the trees stand bigger on their own.
  const stepPx = crownR * 1.15;
  const grow = 1 + (1 - cover) * 0.7;
  for (let gy = -stepPx; gy < H + stepPx; gy += stepPx) {
    for (let gx = -stepPx; gx < W + stepPx; gx += stepPx) {
      const n = rnd() < 0.5 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const x = gx + rnd() * stepPx, y = gy + rnd() * stepPx;
        const mx = Math.min(mw - 1, Math.max(0, Math.floor(x / cell))), my = Math.min(mh - 1, Math.max(0, Math.floor(y / cell)));
        if (!wooded[my * mw + mx]) continue;
        if (cover < 1) {
          const clump = Math.max(0, Math.min(1, at(clumps, Math.max(0, x), Math.max(0, y)) * 2.4 + 0.5));
          if (rnd() > (Math.pow(cover, 2.5) * (0.15 + 1.85 * clump)) / (grow * grow)) continue;
        }
        const u = rnd();
        const r = crownR * (0.45 + u * u * 1.35) * grow;
        const t = 1 + Math.floor(rnd() * 6);
        if (cover < 0.75 && rnd() < (0.75 - cover) * 0.8) clumpTree(x, y, r * 1.5, t);
        else stamp(x, y, r, r * (1.9 + rnd() * 0.9), t);
      }
    }
  }
  // Single trees: real ones placed on the map, and (when the woods aren't from the photo) a few
  // standing along the fairways' edges, as on painted course maps
  const lone = (p: P, rFt: number, t: number) => {
    const sp = toScreen(p);
    if (sp.x < -40 || sp.y < -40 || sp.x > W + 40 || sp.y > H + 40) return;
    clumpTree(sp.x, sp.y, Math.min(Math.max(5.5 * pt, crownR * 2.4), Math.max(2.4 * pt, crownR * 1.6, rFt * k * 0.6)), t);
  };
  for (const t of doc.items.filter(i => i.type === "tree") as TreeItem[]) lone(t, t.radius * (t.width ?? 1), 1 + (idSeed(t.id) % 6));
  if (opts.mode !== "photo") {
    for (const st of stats) {
      const hole = doc.holes.find(h => h.id === st.holeId);
      if (!st.complete || !hole?.fairway) continue;
      const path = smoothPath(st.line, 10);
      const len = pathLength(path);
      const tr = seeded(idSeed(hole.id));
      for (let d = 35; d < len - 25; d += 14 + tr() * 30) {
        if (tr() > 0.55 * cover) continue;
        const along = pointAlong(path, d);
        const side = tr() < 0.5 ? -1 : 1;
        const off = (hole.fairwayWidth / 2) * (0.3 + tr() * 0.7) * side;
        const p = { x: along.point.x - Math.sin(along.angle) * off, y: along.point.y + Math.cos(along.angle) * off };
        const sp = toScreen(p);
        const mx = Math.min(mw - 1, Math.max(0, Math.floor(sp.x / cell))), my = Math.min(mh - 1, Math.max(0, Math.floor(sp.y / cell)));
        const m4 = (my * mw + mx) * 4;
        if (a[m4 + 2] > 60 || b[m4 + 1] > 60 || b[m4] > 120) continue;
        lone(p, 7 + tr() * 6, 1 + Math.floor(tr() * 6));
      }
    }
  }

  // Shadows: from a pixel, look toward the sun (top left, 37 degrees up) for anything taller
  const sunX = -0.62, sunY = -0.78, rise = 0.75;
  let tallest = 0;
  for (let i = 0; i < height.length; i++) if (height[i] > tallest) tallest = height[i];
  const sdx: number[] = [], sdy: number[] = [], sup: number[] = [];
  for (let d = 1.5; d < tallest / rise + 2; d *= 1.32) {
    const dx = Math.round(sunX * d), dy = Math.round(sunY * d);
    if (sdx.length && dx === sdx[sdx.length - 1] && dy === sdy[sdy.length - 1]) continue;
    sdx.push(dx); sdy.push(dy); sup.push(d * rise);
  }
  const nSteps = sdx.length;
  const soft = crownR * 0.7;
  const sunlit = (x: number, y: number, h0: number) => {
    let shade = 0;
    for (let j = 0; j < nSteps; j++) {
      const up = h0 + sup[j];
      if (up >= tallest) break;
      const sx = x + sdx[j], sy = y + sdy[j];
      if (sx < 0 || sy < 0) break;
      const over = height[sy * W + sx] - up;
      if (over > 0) {
        shade = Math.max(shade, over / soft);
        if (shade >= 1) return 0;
      }
    }
    return 1 - shade;
  };
  // On the ground, every other pixel is enough (the shadows are soft)
  const hw = (W >> 1) + 1;
  const groundSun = new Float32Array(hw * ((H >> 1) + 1));
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) groundSun[(y >> 1) * hw + (x >> 1)] = sunlit(x, y, 0);

  // Treetop colors: deep shade to sunlit yellow-green, from the style's tree color
  const tree = hexRgb(s.trees);
  const ramp: RGB[] = [];
  const stops: [number, RGB][] = [[0, times(tree, 0.16)], [0.3, times(tree, 0.45)], [0.55, times(tree, 0.92)], [0.78, mix(tree, [150, 180, 80], 0.45)], [1, mix(tree, [214, 226, 130], 0.7)]];
  for (let j = 0; j < 256; j++) {
    const t = j / 255;
    let q = 1;
    while (q < stops.length - 1 && stops[q][0] < t) q++;
    const [t0, c0] = stops[q - 1], [t1, c1] = stops[q];
    ramp.push(mix(c0, c1, (t - t0) / (t1 - t0)));
  }
  // Each tree a little different: yellower, bluer, grayer
  const tints: RGB[] = [[1, 1, 1], [1, 1, 1], [1.1, 1.05, 0.82], [0.86, 0.96, 1.08], [1.02, 0.97, 0.9], [0.92, 0.98, 0.94], [1.06, 1.06, 0.95]];
  const L = { x: -0.5, y: -0.62, z: 0.6 };
  const ll = Math.hypot(L.x, L.y, L.z);
  L.x /= ll; L.y /= ll; L.z /= ll;
  const bump = crownR * 0.9;
  // The ground darkens near the woods, all round (the light under the trees' edges)
  const near = (() => {
    const cov = document.createElement("canvas");
    cov.width = mw;
    cov.height = mh;
    const g = cov.getContext("2d", { willReadFrequently: true })!;
    const id = g.createImageData(mw, mh);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (height[y * W + x] > 0) id.data[((y >> 1) * mw + (x >> 1)) * 4] = 255;
    for (let m = 3; m < id.data.length; m += 4) id.data[m] = 255;
    g.putImageData(id, 0, 0);
    const o2 = document.createElement("canvas");
    o2.width = mw;
    o2.height = mh;
    const g2 = o2.getContext("2d", { willReadFrequently: true })!;
    g2.filter = `blur(${2.2 * (pt / cell)}px)`;
    g2.drawImage(cov, 0, 0);
    return g2.getImageData(0, 0, mw, mh).data;
  })();
  // The ground's relief (hill shading), from the terrain, lit from the same side
  const relief = reliefGrid(doc, s.hillshade, W, H, toPlan);

  for (let y = 0; y < H; y++) {
    const tr = (y & 511) << 9, tu = ((y - 1) & 511) << 9, td = ((y + 1) & 511) << 9;
    for (let x = 0, i = y * W; x < W; x++, i++) {
      const o4 = i * 4;
      const rf = relief ? relief(x, y) : 1;
      const h = height[i];
      if (h > 0) {
        // The slope of the leafy surface (neighbours outside the crowns count as level)
        const c0 = h + LEAF[tr | (x & 511)] * bump;
        const hr = x < W - 1 && height[i + 1] > 0 ? height[i + 1] + LEAF[tr | ((x + 1) & 511)] * bump : c0;
        const hl = x > 0 && height[i - 1] > 0 ? height[i - 1] + LEAF[tr | ((x - 1) & 511)] * bump : c0;
        const hd = y < H - 1 && height[i + W] > 0 ? height[i + W] + LEAF[td | (x & 511)] * bump : c0;
        const hu = y > 0 && height[i - W] > 0 ? height[i - W] + LEAF[tu | (x & 511)] * bump : c0;
        const gx = (hr - hl) * 0.5, gy = (hd - hu) * 0.5;
        const lam = Math.max(0, (-gx * L.x - gy * L.y + L.z) / Math.sqrt(gx * gx + gy * gy + 1));
        const sun = sunlit(x, y, h);
        let t = 0.04 + lam * Math.sqrt(Math.sqrt(lam)) * (0.22 + 0.78 * sun);
        // Sun flecks on the lit tops
        if (sun > 0.7 && lam > 0.75 && LEAF[tr | (x & 511)] > 0.68) t += 0.12;
        const area = at(stands, x, y);
        t = Math.max(0, Math.min(1, t * (1 + area * 0.45) * (0.75 + 0.25 * rf)));
        const base = ramp[Math.round(t * 255)];
        const tn = tints[kind[i] % tints.length];
        // Some stands of trees olive-gray and some a deeper blue-green, over large patches
        const gray = Math.max(0, area) * 0.9, deep = Math.max(0, -area) * 0.6;
        const lum = (base[0] + base[1] + base[2]) / 3;
        o[o4] = (base[0] * tn[0] * (1 - gray) + lum * 1.08 * gray) * (1 - deep * 0.25);
        o[o4 + 1] = (base[1] * tn[1] * (1 - gray) + lum * 1.1 * gray) * (1 - deep * 0.08);
        o[o4 + 2] = (base[2] * tn[2] * (1 - gray) + lum * 0.82 * gray) * (1 + deep * 0.1);
      } else {
        // Ground in the trees' shadows: darker and a touch blue
        const sun = groundSun[(y >> 1) * hw + (x >> 1)];
        const ao = near[(Math.min(mh - 1, y >> 1) * mw + Math.min(mw - 1, x >> 1)) * 4] / 255;
        const sh = (0.48 + 0.52 * sun) * (1 - 0.38 * ao);
        o[o4] = o[o4] * sh * 0.97 * rf;
        o[o4 + 1] = o[o4 + 1] * sh * rf;
        o[o4 + 2] = o[o4 + 2] * (sh + (1 - sh) * 0.15) * rf;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

// The terrain as a plain grid (looking heights up by "x,y" keys is slow for every pixel)
const terrainGrids = new WeakMap<object, { cols: number; rows: number; grid: number; data: Float32Array }>();
const terrainGrid = (doc: CourseDoc) => {
  const hit = terrainGrids.get(doc.terrainHeights);
  if (hit) return hit;
  const grid = doc.gridSize || 20;
  // As big as the measured points reach (no empty rows past them, which would read as a cliff)
  const cells: [number, number, number][] = [];
  let cols = 1, rows = 1;
  for (const [key, v] of Object.entries(doc.terrainHeights)) {
    const comma = key.indexOf(",");
    const c = Math.round(Number(key.slice(0, comma)) / grid), r = Math.round(Number(key.slice(comma + 1)) / grid);
    if (c < 0 || r < 0) continue;
    cells.push([c, r, v]);
    cols = Math.max(cols, c + 1);
    rows = Math.max(rows, r + 1);
  }
  cols = Math.max(2, cols);
  rows = Math.max(2, rows);
  const data = new Float32Array(cols * rows);
  for (const [c, r, v] of cells) data[r * cols + c] = v;
  const value = { cols, rows, grid, data };
  terrainGrids.set(doc.terrainHeights, value);
  return value;
};

/** Hill shading for the painting, as a function of the pixel (null when the ground is flat). */
const reliefGrid = (doc: CourseDoc, on: boolean, W: number, H: number, toPlan: (x: number, y: number) => P) => {
  const heights = doc.terrainHeights;
  if (!on || !heights || Object.keys(heights).length < 4) return null;
  const tg = terrainGrid(doc);
  const step = 8;
  const gw = Math.ceil(W / step) + 2, gh = Math.ceil(H / step) + 2;
  const grid = new Float32Array(gw * gh);
  const e = Math.max(2, doc.gridSize / 2);
  const L = { x: -0.5, y: -0.62, z: 0.6 };
  // Beyond the measured ground the edge heights carry on (no cliff at the site's edge)
  const at = (p: P) => {
    const fx = Math.max(0, Math.min(tg.cols - 1.001, p.x / tg.grid)), fy = Math.max(0, Math.min(tg.rows - 1.001, p.y / tg.grid));
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, j = iy * tg.cols + ix, d = tg.data;
    return (d[j] * (1 - tx) + d[j + 1] * tx) * (1 - ty) + (d[j + tg.cols] * (1 - tx) + d[j + tg.cols + 1] * tx) * ty;
  };
  let lo = Infinity, hi = -Infinity;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const p = toPlan(gx * step, gy * step);
      // Screen right and down, in plan feet
      const px = toPlan(gx * step + 1, gy * step), py = toPlan(gx * step, gy * step + 1);
      const rx = { x: px.x - p.x, y: px.y - p.y }, ry = { x: py.x - p.x, y: py.y - p.y };
      const rl = Math.hypot(rx.x, rx.y) || 1;
      const ux = { x: rx.x / rl, y: rx.y / rl }, uy = { x: ry.x / rl, y: ry.y / rl };
      const exag = 2.5;
      const dzx = ((at({ x: p.x + ux.x * e, y: p.y + ux.y * e }) - at({ x: p.x - ux.x * e, y: p.y - ux.y * e })) / (2 * e)) * exag;
      const dzy = ((at({ x: p.x + uy.x * e, y: p.y + uy.y * e }) - at({ x: p.x - uy.x * e, y: p.y - uy.y * e })) / (2 * e)) * exag;
      const shade = (-dzx * L.x - dzy * L.y + L.z) / Math.hypot(dzx, dzy, 1) / L.z;
      const v = Math.max(0.6, Math.min(1.3, 1 + (shade - 1) * 0.7));
      grid[gy * gw + gx] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  if (hi - lo < 0.01) return null;
  return (x: number, y: number) => {
    const fx = x / step, fy = y / step;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const j = iy * gw + ix;
    return (grid[j] * (1 - tx) + grid[j + 1] * tx) * (1 - ty) + (grid[j + gw] * (1 - tx) + grid[j + gw + 1] * tx) * ty;
  };
};
