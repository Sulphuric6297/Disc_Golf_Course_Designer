// Parking lots no map has, found on the photo and the aerial survey together: on the photo,
// pavement (grey, not green, not a painted court); in the survey, flat at ground level (no roof,
// no tree over it, nothing taller than a truck on it). A grey roof looks the same as a parking lot
// from above, so without a survey there's no telling them apart, and none are looked for.
import { createArea } from "../course";
import { pointInPolygon, polygonArea, simplify } from "../geom";
import type { Measured } from "../lidar";
import { orientedBox } from "../structures";
import type { AreaItem, CourseItem, LineItem, P } from "../../types";
import { components, open, traceOutline } from "./detect";

/** Each cell of the grid looked over, ft. */
const CELL = 3;

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
      const pts = it.points;
      const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.x)) / CELL)), x1 = Math.min(gw - 1, Math.ceil(Math.max(...pts.map(p => p.x)) / CELL));
      const y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.y)) / CELL)), y1 = Math.min(gh - 1, Math.ceil(Math.max(...pts.map(p => p.y)) / CELL));
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (pointInPolygon({ x: (i + 0.5) * CELL, y: (j + 0.5) * CELL }, pts)) mask[j * gw + i] = 0;
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
