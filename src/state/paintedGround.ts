// The ground in the Design look for flyovers, the tee view and videos: the painted map of the
// whole site (the Forest painting, in the course's own colors), draped on the terrain in place of
// the satellite photo. Painted a slice at a time, once per version of the course.
import { useEffect, useState } from "react";
import { canopyFor, detailArea, forestCanvasAsync, paintedFrom, woodedOf, type WoodedGrid } from "../lib/forest";
import { holeStats } from "../lib/holeStats";
import type { CourseDoc } from "../types";
import { useCourse } from "./course";

/** The painting's longest side, pixels (about a foot per pixel on a usual site, like the photo). */
const MAX_PX = 2048;

/** The painting (a picture's URL) and where it shows woods. */
export type PaintedGround = { url: string; wooded: WoodedGrid | null };

const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object) => {
  if (!ids.has(o)) ids.set(o, nextId++);
  return ids.get(o)!;
};
/** What the painting depends on (not flyover settings, names, the logo and such). */
const paintKey = (doc: CourseDoc) =>
  JSON.stringify([
    { ...doc.style, logo: undefined, card: undefined, sign: undefined, discFlight: undefined, legendAt: undefined, page: undefined, texts: undefined, images: undefined, title: undefined, subtitle: undefined, footer: undefined },
    idOf(doc.terrainHeights),
    doc.background?.length ?? 0,
    doc.canvas,
    doc.activeLayout,
    paintedFrom(doc)
  ]);

const made = new Map<string, Promise<PaintedGround | null>>();
/** The latest paintings (blob URLs), oldest first; older ones are let go. */
const kept: { key: string; url: string }[] = [];
let under: { key: string; stop: AbortController } | null = null;

/** The painted ground of a course, or null when it can't be painted. */
export const paintedGround = (doc: CourseDoc): Promise<PaintedGround | null> => {
  const key = paintKey(doc);
  const hit = made.get(key);
  if (hit) return hit;
  // (a newer version of the course: the one under way is no longer wanted)
  if (under && under.key !== key) under.stop.abort();
  const job = { key, stop: new AbortController() };
  under = job;
  const { width, height } = doc.canvas;
  const k = Math.min(4, MAX_PX / Math.max(width, height, 1));
  const view = { cx: width / 2, cy: height / 2, rotation: 0, scale: k, width: width * k, height: height * k };
  const work = (async () => {
    const canopy = doc.style.forest === "photo" ? await canopyFor(doc) : null;
    const canvas = await forestCanvasAsync(doc, view, doc.holes.map(h => holeStats(doc, h)), { mode: doc.style.forest ?? "everywhere", canopy, style: doc.style, density: 1, under: true }, job.stop.signal);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    kept.push({ key, url });
    while (kept.length > 3) {
      const old = kept.shift()!;
      made.delete(old.key);
      URL.revokeObjectURL(old.url);
    }
    return { url, wooded: woodedOf(canvas) };
  })().catch((err: unknown) => {
    // (stopped for a newer one: nothing to say; a failure is said)
    if (!job.stop.signal.aborted) console.error("The ground couldn't be painted:", err);
    made.delete(key);
    return null;
  }).finally(() => {
    if (under === job) under = null;
  });
  made.set(key, work);
  return work;
};

/** A sharper painting round one hole, for its tee view, flyover and video: the canvas (its edges
 * fading out, over the painting of the whole site) and the plan rectangle it covers. */
export type PaintedDetail = { canvas: HTMLCanvasElement; rect: { x: number; y: number; width: number; height: number } };

/** Its edges fade over this many ft into the painting of the whole site. */
const DETAIL_FADE = 40;

const detailMade = new Map<string, Promise<PaintedDetail | null>>();
let detailUnder: { key: string; stop: AbortController } | null = null;

/** The sharp painting round a hole (`maxPx` its longest side), or null when the whole site's
 * painting is already about as sharp there. Painted once per version of the course. */
export const paintedDetail = (doc: CourseDoc, holeId: string, maxPx = 3072): Promise<PaintedDetail | null> => {
  const hole = doc.holes.find(h => h.id === holeId);
  if (!hole) return Promise.resolve(null);
  const st = holeStats(doc, hole);
  if (!st.complete) return Promise.resolve(null);
  const { width, height } = doc.canvas;
  const at = detailArea(doc, st.line, maxPx, Math.min(4, MAX_PX / Math.max(width, height, 1)));
  if (!at) return Promise.resolve(null);
  const { rect, k } = at;
  const key = JSON.stringify([paintKey(doc), rect, Math.round(k * 100)]);
  const hit = detailMade.get(key);
  if (hit) return hit;
  if (detailUnder && detailUnder.key !== key) detailUnder.stop.abort();
  const job = { key, stop: new AbortController() };
  detailUnder = job;
  const view = { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, rotation: 0, scale: k, width: rect.width * k, height: rect.height * k };
  const work = (async () => {
    const canopy = doc.style.forest === "photo" ? await canopyFor(doc) : null;
    const canvas = await forestCanvasAsync(doc, view, doc.holes.map(h => holeStats(doc, h)), { mode: doc.style.forest ?? "everywhere", canopy, style: doc.style, density: 1, under: true }, job.stop.signal);
    // Its edges fade into the painting of the whole site (none where it meets the site's edge)
    const c = canvas.getContext("2d")!;
    const f = DETAIL_FADE * k;
    c.globalCompositeOperation = "destination-out";
    const W = canvas.width, H = canvas.height;
    const band = (x: number, y: number, w: number, h: number, gx0: number, gy0: number, gx1: number, gy1: number) => {
      const grad = c.createLinearGradient(gx0, gy0, gx1, gy1);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = grad;
      c.fillRect(x, y, w, h);
    };
    if (rect.x > 0) band(0, 0, f, H, 0, 0, f, 0);
    if (rect.x + rect.width < width) band(W - f, 0, f, H, W, 0, W - f, 0);
    if (rect.y > 0) band(0, 0, W, f, 0, 0, 0, f);
    if (rect.y + rect.height < height) band(0, H - f, W, f, 0, H, 0, H - f);
    c.globalCompositeOperation = "source-over";
    return { canvas, rect };
  })().catch((err: unknown) => {
    if (!job.stop.signal.aborted) console.error("The hole's ground couldn't be painted:", err);
    detailMade.delete(key);
    return null;
  }).finally(() => {
    if (detailUnder === job) detailUnder = null;
  });
  // (only the latest two kept: each is a big picture)
  detailMade.set(key, work);
  while (detailMade.size > 2) detailMade.delete(detailMade.keys().next().value!);
  return work;
};

/** The painted ground for the course as it is, while `active` (null until it is painted). */
export const usePaintedGround = (active: boolean) => {
  const doc = useCourse(s => s.doc);
  const [got, setGot] = useState<PaintedGround | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    void paintedGround(doc).then(p => { if (live && p) setGot(p); });
    return () => { live = false; };
  }, [active, doc]);
  // (the last painting stands in while the course's newest version paints)
  return active ? got : null;
};
