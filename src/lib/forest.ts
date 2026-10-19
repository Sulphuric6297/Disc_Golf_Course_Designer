// The painted forest for the "Forest" map style (the lush look of hand-made course maps): tree
// crowns packed everywhere the land is wooded, with soft shadows, and the fairways, paths, water
// and putting areas cut out of it as clearings. Drawn into a canvas (thousands of crowns) and laid
// into the SVG map as a picture.
import { CIRCLE_ONE_FT, LINE_KINDS } from "../constants";
import type { AreaItem, CourseDoc, P, TreeItem } from "../types";
import { canopyMask } from "./geo/detect";
import { corridor, smoothPath } from "./geom";
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

// --- Crown pictures (made once): a lumpy crown lit from the top left, and a soft shadow

type Sprites = { crowns: HTMLCanvasElement[]; shadow: HTMLCanvasElement; key: string };
let sprites: Sprites | null = null;

const hexRgb = (hex: string) => {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const rgb = (c: number[], k: number) => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))))).join(",")})`;

const makeSprites = (color: string): Sprites => {
  const key = color;
  if (sprites?.key === key) return sprites;
  const base = hexRgb(color);
  const S = 96;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const crowns: HTMLCanvasElement[] = [];
  for (let v = 0; v < 8; v++) {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d")!;
    const tone = (v - 2.5) * 0.05;
    // Some crowns yellower, some bluer (different kinds of trees)
    const shift = (rnd() - 0.5) * 0.5;
    const hue = [base[0] * (1 + shift * 0.6), base[1] * (1 + Math.abs(shift) * 0.1), base[2] * (1 - shift * 0.6)];
    // The crown: several leafy clumps, each lit from the top left
    const clumps: { x: number; y: number; r: number }[] = [{ x: S / 2, y: S / 2, r: S * 0.36 }];
    const n = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
      const d = S * (0.16 + rnd() * 0.1);
      clumps.push({ x: S / 2 + Math.cos(a) * d, y: S / 2 + Math.sin(a) * d, r: S * (0.15 + rnd() * 0.08) });
    }
    for (const cl of clumps) {
      const grad = g.createRadialGradient(cl.x - cl.r * 0.35, cl.y - cl.r * 0.4, cl.r * 0.05, cl.x, cl.y, cl.r);
      grad.addColorStop(0, rgb(hue, 0.3 + tone));
      grad.addColorStop(0.5, rgb(hue, 0.04 + tone));
      grad.addColorStop(0.85, rgb(hue, -0.22 + tone));
      grad.addColorStop(1, `rgba(${hue.map(v => Math.round(v * 0.55)).join(",")},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      g.fill();
    }
    // Leaf speckle
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * S * 0.4;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      g.fillStyle = rnd() > 0.55 ? `rgba(255,255,220,${0.08 + rnd() * 0.1})` : `rgba(0,20,0,${0.1 + rnd() * 0.12})`;
      g.beginPath();
      g.arc(x, y, 1 + rnd() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    crowns.push(c);
  }
  const shadow = document.createElement("canvas");
  shadow.width = shadow.height = S;
  const sg = shadow.getContext("2d")!;
  const grad = sg.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, "rgba(6,22,4,0.75)");
  grad.addColorStop(0.6, "rgba(6,22,4,0.45)");
  grad.addColorStop(1, "rgba(6,22,4,0)");
  sg.fillStyle = grad;
  sg.fillRect(0, 0, S, S);
  sprites = { crowns, shadow, key };
  return sprites;
};

export type ForestView = { cx: number; cy: number; rotation: number; scale: number; width: number; height: number };

/**
 * The forest over the map view, as a canvas `density` times the view's size: crowns where the
 * land is wooded (everywhere, where the photo shows trees, or only in drawn woods), cleared for the
 * fairways, putting areas, tees, paths, water and open areas; then the single trees.
 */
export const forestCanvas = (doc: CourseDoc, view: ForestView, stats: HoleStats[], opts: { mode: ForestMode; canopy: CanopyGrid | null; trees: string; density?: number }) => {
  const density = opts.density ?? 2;
  const W = Math.max(1, Math.round(view.width * density)), H = Math.max(1, Math.round(view.height * density));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const k = view.scale * density;
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

  // Clearings, drawn into a small mask (one cell per few pixels)
  const cell = 3;
  const mw = Math.ceil(W / cell), mh = Math.ceil(H / cell);
  const mc = document.createElement("canvas");
  mc.width = mw;
  mc.height = mh;
  const m = mc.getContext("2d", { willReadFrequently: true })!;
  const mk = k / cell;
  m.setTransform(mk * cos, mk * sin, -mk * sin, mk * cos, mw / 2 - (view.cx * cos - view.cy * sin) * mk, mh / 2 - (view.cx * sin + view.cy * cos) * mk);
  const poly = (pts: P[]) => {
    m.beginPath();
    pts.forEach((p, i) => (i ? m.lineTo(p.x, p.y) : m.moveTo(p.x, p.y)));
    m.closePath();
    m.fill();
  };
  const disc = (p: P, r: number) => { m.beginPath(); m.arc(p.x, p.y, r, 0, Math.PI * 2); m.fill(); };
  const stroke = (pts: P[], width: number) => {
    m.lineWidth = width;
    m.lineCap = "round";
    m.lineJoin = "round";
    m.beginPath();
    pts.forEach((p, i) => (i ? m.lineTo(p.x, p.y) : m.moveTo(p.x, p.y)));
    m.stroke();
  };
  // Woods (red channel) and clearings (green channel)
  m.fillStyle = "rgb(255,0,0)";
  for (const a of doc.items.filter(i => i.type === "area" && i.kind === "woods") as AreaItem[]) poly(a.points);
  m.fillStyle = "rgb(0,255,0)";
  m.strokeStyle = "rgb(0,255,0)";
  for (const s of stats) {
    const hole = doc.holes.find(h => h.id === s.holeId);
    if (!s.complete || !hole) continue;
    poly(corridor(smoothPath(s.line, 10), Math.max(18, hole.fairwayWidth * (hole.fairway ? 1 : 0.6)), 10));
  }
  for (const i of doc.items) {
    if (i.type === "tee") disc(i, Math.max(12, i.padLength * 0.9));
    else if (i.type === "basket") disc(i, CIRCLE_ONE_FT * 0.8);
    else if (i.type === "dropzone") disc(i, 10);
    else if (i.type === "amenity") disc(i, 10);
    else if (i.type === "area" && ["fairway", "green", "rough", "water", "parking", "building", "sand", "nogo"].includes(i.kind)) poly(i.points);
    else if (i.type === "line" && i.kind !== "ob" && i.kind !== "fence" && i.kind !== "walk") stroke(i.kind === "stream" || i.kind === "path" ? smoothPath(i.points, 8) : i.points, Math.max(6, (i.width ?? LINE_KINDS[i.kind].width) + 6));
  }
  const maskData = m.getImageData(0, 0, mw, mh).data;
  const clearAt = (x: number, y: number) => {
    const cx = Math.min(mw - 1, Math.max(0, Math.floor(x / cell))), cy = Math.min(mh - 1, Math.max(0, Math.floor(y / cell)));
    return maskData[(cy * mw + cx) * 4 + 1] > 127;
  };
  const woodsAt = (x: number, y: number) => {
    const cx = Math.min(mw - 1, Math.max(0, Math.floor(x / cell))), cy = Math.min(mh - 1, Math.max(0, Math.floor(y / cell)));
    return maskData[(cy * mw + cx) * 4] > 127;
  };
  const site = (p: P) => p.x >= -doc.canvas.width * 0.5 && p.y >= -doc.canvas.height * 0.5 && p.x <= doc.canvas.width * 1.5 && p.y <= doc.canvas.height * 1.5;
  const canopy = opts.canopy;
  const photoTrees = (p: P) => {
    if (!canopy) return false;
    const c = Math.floor(p.x / canopy.ftPerCell), r = Math.floor(p.y / canopy.ftPerCell);
    // Beyond the photo nothing is known: paint it wooded, so the page's edges stay lush
    if (c < 0 || r < 0 || c >= canopy.cols || r >= canopy.rows) return site(p);
    // Any canopy in the neighborhood (crowns are about 10 m across)
    const reach = Math.max(1, Math.round(6 / canopy.ftPerCell));
    let hits = 0, all = 0;
    for (let dy = -reach; dy <= reach; dy += reach) for (let dx = -reach; dx <= reach; dx += reach) {
      const cc = c + dx, rr = r + dy;
      if (cc < 0 || rr < 0 || cc >= canopy.cols || rr >= canopy.rows) continue;
      all++;
      if (canopy.data[rr * canopy.cols + cc]) hits++;
    }
    return hits >= Math.max(2, all * 0.3);
  };
  const wooded = (x: number, y: number) => {
    if (clearAt(x, y)) return false;
    if (woodsAt(x, y)) return true;
    const p = toPlan(x, y);
    if (opts.mode === "everywhere") return site(p);
    if (opts.mode === "photo") return canopy ? photoTrees(p) : site(p);
    return false;
  };

  const sp = makeSprites(opts.trees);
  // The forest floor: deep shade under the crowns, so gaps between them read as depth
  {
    const floor = document.createElement("canvas");
    floor.width = mw;
    floor.height = mh;
    const f = floor.getContext("2d")!;
    const img = f.createImageData(mw, mh);
    const dark = hexRgb(opts.trees).map(v => Math.round(v * 0.42));
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      if (!wooded(x * cell + cell / 2, y * cell + cell / 2)) continue;
      const i = (y * mw + x) * 4;
      img.data[i] = dark[0]; img.data[i + 1] = dark[1]; img.data[i + 2] = dark[2]; img.data[i + 3] = 235;
    }
    f.putImageData(img, 0, 0);
    ctx.save();
    ctx.filter = `blur(${Math.max(1, 3 * density)}px)`;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(floor, 0, 0, mw * cell, mh * cell);
    ctx.restore();
  }
  // Crowns about 22 ft across, never smaller than a few pixels on the page
  const crownPx = Math.max(5.5 * density, 22 * k);
  const step = crownPx * 0.62;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const crowns: { x: number; y: number; r: number; v: number }[] = [];
  for (let y = -step; y < H + step; y += step * 0.86) {
    for (let x = -step, row = Math.round(y / step) % 2; x < W + step; x += step) {
      const px = x + (row ? step / 2 : 0) + (rnd() - 0.5) * step * 0.7;
      const py = y + (rnd() - 0.5) * step * 0.7;
      if (!wooded(px, py)) continue;
      const big = rnd() < 0.12 ? 1.5 : 1;
      crowns.push({ x: px, y: py, r: (crownPx / 2) * (0.7 + rnd() * 0.55) * big, v: Math.floor(rnd() * sp.crowns.length) });
    }
  }
  // Big crowns on top; shadows fall to the bottom right, onto the clearings too
  crowns.sort((a, b) => a.r - b.r);
  ctx.globalAlpha = 0.85;
  for (const c of crowns) ctx.drawImage(sp.shadow, c.x - c.r * 0.9 + c.r * 0.45, c.y - c.r * 0.9 + c.r * 0.55, c.r * 2.1, c.r * 2.1);
  ctx.globalAlpha = 1;
  for (const c of crowns) ctx.drawImage(sp.crowns[c.v], c.x - c.r * 1.25, c.y - c.r * 1.25, c.r * 2.5, c.r * 2.5);
  // Single trees: with their own size, wherever they stand (lone trees in fairways)
  const trees = (doc.items.filter(i => i.type === "tree") as TreeItem[]).map(t => ({ t, s: toScreen(t) })).filter(({ s }) => s.x > -50 && s.y > -50 && s.x < W + 50 && s.y < H + 50);
  for (const { t, s } of trees) {
    const r = Math.max(3 * density, t.radius * (t.width ?? 1) * k);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(sp.shadow, s.x - r * 0.9 + r * 0.5, s.y - r * 0.9 + r * 0.6, r * 2.1, r * 2.1);
    ctx.globalAlpha = 1;
    ctx.drawImage(sp.crowns[(t.id.charCodeAt(0) + t.id.length) % sp.crowns.length], s.x - r * 1.25, s.y - r * 1.25, r * 2.5, r * 2.5);
  }
  return canvas;
};

