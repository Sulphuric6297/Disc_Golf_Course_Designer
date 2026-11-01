// For the tests: how much a change of style changes a stretch of the illustrated map (the mean
// difference of its pixels, 0 to 255, the treetops over the buildings laid on), so a test can tell
// a setting that does nothing in some look from one that works in all of them.
import { canopyFor, forestCanvas, treesOverOf, type ForestView } from "./forest";
import { courseStats } from "./holeStats";
import { coursePoints, renderPoster } from "./mapSvg";
import { rotatePoint } from "./geom";
import type { CourseDoc, MapStyle } from "../types";

// (the last few, so a style compared with many others is painted once)
const kept = new Map<string, Uint8ClampedArray>();
const pixels = async (doc: CourseDoc, view: ForestView) => {
  const key = JSON.stringify([doc.style, view, doc.items.length]);
  const had = kept.get(key);
  // (used again: kept longest)
  if (had) { kept.delete(key); kept.set(key, had); return had; }
  const data = await paint(doc, view);
  kept.set(key, data);
  if (kept.size > 4) kept.delete(kept.keys().next().value!);
  return data;
};
const paint = async (doc: CourseDoc, view: ForestView) => {
  const canopy = await canopyFor(doc).catch(() => null);
  const c = forestCanvas(doc, view, courseStats(doc), { mode: doc.style.forest ?? "everywhere", canopy, style: doc.style, density: 1 });
  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  const g = out.getContext("2d")!;
  g.drawImage(c, 0, 0);
  const over = treesOverOf(c);
  if (over) g.drawImage(over.picture, 0, 0, c.width, c.height);
  return g.getImageData(0, 0, out.width, out.height).data;
};

if (typeof window !== "undefined") {
  (window as unknown as { __dgMapDiff: unknown }).__dgMapDiff = async (doc: CourseDoc, a: MapStyle, b: MapStyle, view: ForestView) => {
    const pa = await pixels({ ...doc, style: a }, view), pb = await pixels({ ...doc, style: b }, view);
    let sum = 0;
    for (let i = 0; i < pa.length; i += 4) sum += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
    return sum / (pa.length / 4) / 3;
  };
}

// For the tests: how the course map's page frames the course. Of the page, the share past the
// site's measured ground (0 to 1); how near the page's edge the nearest tee, basket or amenity
// comes (points); and the page's pieces (title, legend, QR code...) any of them is under.
if (typeof window !== "undefined") {
  (window as unknown as { __dgPosterFit: unknown }).__dgPosterFit = (doc: CourseDoc) => {
    const p = renderPoster(doc, { contours: null, hillshade: null });
    const k = Number(/data-el="map" data-box="[^"]*" data-k="([^"]*)"/.exec(p.svg)?.[1]);
    const rot = doc.style.rotation || 0, stats = courseStats(doc), hl = p.holeLines[0];
    const st = stats.find(s => s.holeId === hl?.holeId);
    if (!k || !hl || !st) return null;
    // (the map's middle, from where the first hole's tee landed on the page)
    const v = rotatePoint({ x: (hl.pts[0].x - p.width / 2) / k, y: (hl.pts[0].y - p.height / 2) / k }, rot);
    const c = { x: st.line[0].x - v.x, y: st.line[0].y - v.y };
    const onPage = (q: { x: number; y: number }) => { const r = rotatePoint({ x: q.x - c.x, y: q.y - c.y }, -rot); return { x: p.width / 2 + r.x * k, y: p.height / 2 + r.y * k }; };
    let off = 0, all = 0;
    for (let i = 0; i < 80; i++) for (let j = 0; j < 60; j++) {
      const q = rotatePoint({ x: ((i + 0.5) / 80 - 0.5) * p.width / k, y: ((j + 0.5) / 60 - 0.5) * p.height / k }, rot);
      const x = c.x + q.x, y = c.y + q.y;
      all++;
      if (x < 0 || y < 0 || x > doc.canvas.width || y > doc.canvas.height) off++;
    }
    const pieces = [...p.svg.matchAll(/data-el="([^"]+)" data-box="([^"]+)"/g)].filter(m => m[1] !== "map" && !/^(label|num):/.test(m[1])).map(m => ({ id: m[1], b: m[2].split(" ").map(Number) }));
    const under = new Set<string>();
    let nearest = Infinity;
    for (const q of coursePoints(doc, stats)) {
      const s = onPage(q);
      nearest = Math.min(nearest, s.x, s.y, p.width - s.x, p.height - s.y);
      for (const { id, b } of pieces) if (s.x >= b[0] && s.x <= b[0] + b[2] && s.y >= b[1] && s.y <= b[1] + b[3]) under.add(id);
    }
    return { offSite: off / all, nearest, under: [...under] };
  };
}
