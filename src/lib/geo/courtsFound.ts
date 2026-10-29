// Courts and pools no map has, found on the photo and the aerial survey together: blue painted
// rectangles the size of a court and pools' water, lying at ground level. (Parking lots aren't
// looked for: a lot full of cars and bare winter woods look too alike on a photo.)
import { polygonArea, simplify } from "../geom";
import type { Measured } from "../lidar";
import { boxOutline, orientedBox } from "../structures";
import { createField } from "../fields";
import type { AreaItem, CourseItem, P } from "../../types";
import { components, open, traceOutline } from "./detect";

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
