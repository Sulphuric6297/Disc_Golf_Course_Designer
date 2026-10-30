// The maps' buildings fitted to their roofs on the photo: each moved (up to 12 ft) and turned (up to
// 12°) to where its outline follows the roof's edges best, kept as it came unless the fit is clearly
// better. The photo is what's seen under the course in 2D and 3D, so that's what an outline should
// match. (Shape and size are kept: an outline's never redrawn.)
import type { CourseItem, P, StructureItem } from "../../types";

/** How strongly the photo's brightness changes at each foot of the site (its edges), and which way. */
const edgesOf = async (photoUrl: string, W: number, H: number) => {
  const img = new Image();
  img.src = photoUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) L[k] = px[k * 4] * 0.3 + px[k * 4 + 1] * 0.59 + px[k * 4 + 2] * 0.11;
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x;
    gx[k] = (L[k - W + 1] + 2 * L[k + 1] + L[k + W + 1]) - (L[k - W - 1] + 2 * L[k - 1] + L[k + W - 1]);
    gy[k] = (L[k + W - 1] + 2 * L[k + W] + L[k + W + 1]) - (L[k - W - 1] + 2 * L[k - W] + L[k - W + 1]);
  }
  return { gx, gy, W, H };
};

/** Spots along an outline's sides, a foot apart, each with the side's normal. */
const sidesOf = (pts: P[]) => {
  const out: { p: P; n: P }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    if (l < 2) continue;
    const n = { x: -dy / l, y: dx / l };
    // (not the corners: roofs' overhang rounds them on the photo)
    for (let t = 1; t < l - 1; t += 1) out.push({ p: { x: a.x + (dx * t) / l, y: a.y + (dy * t) / l }, n });
  }
  return out;
};

/**
 * Buildings from FEMA, OpenStreetMap or traced from the air, each fitted to its roof on the photo
 * (`photoUrl`, the site `W` × `H` ft). How many moved.
 */
export const fittedToPhoto = async (items: CourseItem[], photoUrl: string, W: number, H: number) => {
  const w = Math.round(W), h = Math.round(H);
  const e = await edgesOf(photoUrl, w, h);
  const at = (x: number, y: number) => {
    const i = Math.round(x), j = Math.round(y);
    return i > 0 && j > 0 && i < w - 1 && j < h - 1 ? j * w + i : -1;
  };
  // How well an outline's sides lie on edges across them (brightness changing across each side)
  const score = (s: { p: P; n: P }[], c: P, cos: number, sin: number, dx: number, dy: number) => {
    let sum = 0, n = 0;
    for (const { p, n: nm } of s) {
      const rx = p.x - c.x, ry = p.y - c.y;
      const k = at(c.x + rx * cos - ry * sin + dx, c.y + rx * sin + ry * cos + dy);
      if (k < 0) continue;
      const nx = nm.x * cos - nm.y * sin, ny = nm.x * sin + nm.y * cos;
      sum += Math.abs(e.gx[k] * nx + e.gy[k] * ny);
      n++;
    }
    return n ? sum / n : 0;
  };
  let moved = 0;
  const out = items.map(i => {
    // (the maps' buildings and pools: a pool's edge is as clear on the photo as a roof's)
    const pool = i.type === "area" && i.kind === "field" && i.field === "pool" && !!i.importSource;
    const bld = i.type === "structure" && (i.kind === "building" || i.kind === "shelter") && (i.importSource === "osm" || i.importSource === "traced" || i.importSource === "fema");
    if ((!pool && !bld) || !("points" in i) || i.points.length < 3) return i;
    const s = sidesOf(i.points);
    if (s.length < 16) return i;
    const c = i.points.reduce((a, p) => ({ x: a.x + p.x / i.points.length, y: a.y + p.y / i.points.length }), { x: 0, y: 0 });
    const was = score(s, c, 1, 0, 0, 0);
    let best = { a: 0, dx: 0, dy: 0, v: was };
    // Coarse: every 3° and 2 ft; then fine round the best: every 1° and 1 ft
    const look = (a0: number, a1: number, da: number, x0: number, x1: number, y0: number, y1: number, dd: number) => {
      for (let a = a0; a <= a1 + 1e-9; a += da) {
        const r = (a * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
        for (let dy = y0; dy <= y1 + 1e-9; dy += dd) for (let dx = x0; dx <= x1 + 1e-9; dx += dd) {
          const v = score(s, c, cos, sin, dx, dy);
          if (v > best.v) best = { a, dx, dy, v };
        }
      }
    };
    look(-12, 12, 3, -12, 12, -12, 12, 2);
    look(best.a - 2, best.a + 2, 1, best.dx - 2, best.dx + 2, best.dy - 2, best.dy + 2, 1);
    // (kept as it came unless the fit's clearly better: a third stronger along its sides)
    if (best.v < was * 1.33 || (!best.a && !best.dx && !best.dy)) return i;
    moved++;
    const r = (best.a * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    const points = i.points.map(p => { const rx = p.x - c.x, ry = p.y - c.y; return { x: c.x + rx * cos - ry * sin + best.dx, y: c.y + rx * sin + ry * cos + best.dy }; });
    return { ...i, points, x: i.x + best.dx, y: i.y + best.dy } as StructureItem | CourseItem;
  });
  return { items: out, moved };
};
