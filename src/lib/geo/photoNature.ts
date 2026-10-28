// What the aerial photo shows of nature, for a site with no trees measured from the air: stands of
// trees (as woods areas), the trees standing on their own and open water, as course items. The
// finding itself (natureFind.ts) runs in a worker, so the page keeps moving meanwhile.
import { clamp } from "../../constants";
import type { AreaItem, P, TreeItem } from "../../types";
import { createArea, createTree } from "../course";
import { pointInPolygon, simplify } from "../geom";
import { FEET_PER_METER } from "./core";
import { findNature, type PhotoFound } from "./natureFind";

export { findNature, type PhotoFound };

/** How tall a tree found on a photo is when its shadow can't say (ft): a grown park tree. */
export const PHOTO_TREE_HEIGHT = 30;
/** How far a woods outline may stray from the canopy's edge when it's simplified (ft). */
export const WOODS_TOLERANCE = 2.5;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

const stopped = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Stopped.", "AbortError");
};

/** A traced outline (photo pixels) as a shape on the plan: simplified, its corners rounded once. */
export const outlineToPlan = (outline: { x: number; y: number }[], w: number, h: number, width: number, height: number, tolerance: number): P[] => {
  const pts = simplify(outline.map(p => ({ x: (p.x / w) * width, y: (p.y / h) * height })), tolerance);
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return out.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
};

/** The photo (and its near-infrared band) as pixels, at about 30 cm a pixel: plenty for crowns,
 * and quick. */
export const photoPixels = async (url: string, width: number, nirUrl?: string | null) => {
  const [img, nirImg] = await Promise.all([loadImage(url), nirUrl ? loadImage(nirUrl).catch(() => null) : null]);
  const widthM = width / FEET_PER_METER;
  // (a coarser photo is spread to it, so the same sizes in pixels mean the same on the ground)
  const w = Math.max(16, Math.round(Math.min(widthM / 0.3, 4096)));
  const h = Math.max(16, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const read = (im: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  };
  const pixels = read(img);
  if (!pixels) return null;
  let nir: Uint8Array | undefined;
  const n = nirImg && read(nirImg);
  if (n) {
    nir = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) nir[i] = n.data[i * 4];
  }
  return { pixels, nir, w, h, mpp: widthM / w };
};

/** findNature in a worker (the page keeps moving), or here where workers can't run. Stopped, the
 * worker is ended. */
const findInWorker = (photo: NonNullable<Awaited<ReturnType<typeof photoPixels>>>, opts: { date?: string; lat?: number; waterOnly?: boolean; season?: string; canopy?: boolean }, signal?: AbortSignal): Promise<PhotoFound> => {
  if (typeof Worker === "undefined") return Promise.resolve(findNature(photo, opts));
  return new Promise<PhotoFound>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./photoNature.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(findNature(photo, opts));
      return;
    }
    const stop = () => { worker.terminate(); reject(new DOMException("Stopped.", "AbortError")); };
    signal?.addEventListener("abort", stop, { once: true });
    const done = () => { signal?.removeEventListener("abort", stop); worker.terminate(); };
    worker.onmessage = (e: MessageEvent<{ found?: PhotoFound; error?: string }>) => {
      done();
      if (e.data.found) resolve(e.data.found);
      else reject(new Error(e.data.error ?? "Photo search failed"));
    };
    // (a worker that can't start: the search here instead)
    worker.onerror = ev => { ev.preventDefault(); done(); try { resolve(findNature(photo, opts)); } catch (err) { reject(err); } };
    const data = photo.pixels.data.slice();
    const nir = photo.nir?.slice();
    worker.postMessage({ data, width: photo.w, height: photo.h, nir, mpp: photo.mpp, opts }, nir ? [data.buffer, nir.buffer] : [data.buffer]);
  });
};

/** What the satellite photo shows: stands of trees (as woods areas), the trees standing on their
 * own (as trees) and open water (as water areas). `waterOnly`: only the water (trees measured from
 * the air stand in for the rest). `nir`: the photo's near-infrared band, as an image of the same
 * ground; `date`, `season` and `lat`: when and where it was taken (a tree's shadow then says its
 * height; without the infrared, none of the lone trees come from a bare winter photo). `canopy`
 * with `waterOnly`: the photo's tree canopy as well, a pixel each (`leaf`). */
export const natureFromPhoto = async (
  url: string,
  width: number,
  height: number,
  onStep: (text: string, fraction: number) => void = () => {},
  opts: { signal?: AbortSignal; waterOnly?: boolean; nir?: string | null; date?: string; lat?: number; season?: string; canopy?: boolean } = {}
): Promise<{ trees: TreeItem[]; woods: AreaItem[]; water: AreaItem[]; leaf?: { mask: Uint8Array; w: number; h: number } }> => {
  onStep(opts.waterOnly ? "Finding water on the photo…" : "Finding woods, trees and water on the photo…", 0.05);
  const photo = await photoPixels(url, width, opts.waterOnly && !opts.canopy ? null : opts.nir);
  stopped(opts.signal);
  if (!photo) return { trees: [], woods: [], water: [] };
  onStep(opts.waterOnly ? "Finding water on the photo…" : "Finding woods, trees and water on the photo…", 0.2);
  const found = await findInWorker(photo, { date: opts.date, lat: opts.lat, waterOnly: opts.waterOnly, season: opts.season, canopy: opts.canopy }, opts.signal);
  stopped(opts.signal);
  onStep("Tracing the woods…", 0.9);
  const { w, h } = photo;
  const area = (kind: "woods" | "water", outline: { x: number; y: number }[], tolerance: number) => ({ ...createArea(kind, outlineToPlan(outline, w, h, width, height, tolerance)), importSource: "photo" as const }) as AreaItem;
  const woods = found.woods.map(r => area("woods", r.outline, WOODS_TOLERANCE)).filter(a => a.points.length >= 3);
  const water = found.water.map(r => area("water", r.outline, 2)).filter(a => a.points.length >= 3);
  // (a crown's size as found; its height from its shadow, or a grown park tree's)
  const trees = found.trees
    .map(t => createTree({ x: (t.x / w) * width, y: (t.y / h) * height }, { radius: Math.round(clamp(t.radiusPx * photo.mpp * FEET_PER_METER, 5, 35)), height: t.heightFt ?? PHOTO_TREE_HEIGHT, importSource: "photo" }))
    .filter(t => !water.some(a => pointInPolygon(t, a.points)));
  return { trees, woods, water, ...(opts.canopy && found.mask ? { leaf: { mask: found.mask, w, h } } : {}) };
};
