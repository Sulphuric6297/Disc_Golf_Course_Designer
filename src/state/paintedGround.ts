// The ground in the Design look for flyovers, the tee view and videos: the painted map of the
// whole site (the Forest painting, in the course's own colors), draped on the terrain in place of
// the satellite photo. Painted a slice at a time, once per version of the course.
import { useEffect, useState } from "react";
import { canopyFor, forestCanvasAsync, paintedFrom, woodedOf, type WoodedGrid } from "../lib/forest";
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
    { ...doc.style, logo: undefined, card: undefined, legendAt: undefined },
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
    const canvas = await forestCanvasAsync(doc, view, doc.holes.map(h => holeStats(doc, h)), { mode: doc.style.forest ?? "everywhere", canopy, style: doc.style, density: 1 }, job.stop.signal);
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
  })().catch(() => {
    made.delete(key);
    return null;
  }).finally(() => {
    if (under === job) under = null;
  });
  made.set(key, work);
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
