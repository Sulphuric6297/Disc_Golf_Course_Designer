// For the tests: how much a change of style changes a stretch of the illustrated map (the mean
// difference of its pixels, 0 to 255, the treetops over the buildings laid on), so a test can tell
// a setting that does nothing in some look from one that works in all of them.
import { canopyFor, forestCanvas, treesOverOf, type ForestView } from "./forest";
import { courseStats } from "./holeStats";
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
